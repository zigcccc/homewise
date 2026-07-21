import { zodResolver } from '@hookform/resolvers/zod';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { format, isValid, parse, parseISO } from 'date-fns';
import dayjs from 'dayjs';
import { type InferRequestType, type InferResponseType } from 'hono';
import { ArchiveIcon, ArchiveRestoreIcon, CalendarIcon, MoreHorizontal, PencilIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { createChildDictionaryEntryModel } from '@homewise/server/child-dictionaries';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Calendar,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import { ConfirmDeleteDialog } from '@/modules/shared/components';

const $listEntries = client['child-dictionaries'][':id'].entries.$get;
/** Narrowed to the 200 response — the bare inference unions in every error status too. */
export type DictionaryEntry = InferResponseType<typeof $listEntries, 200>[number];

const $postEntry = client['child-dictionaries'][':id'].entries.$post;
type CreateEntryPayload = InferRequestType<typeof $postEntry>['json'];

const $patchEntry = client['child-dictionaries'][':id'].entries[':entryId'].$patch;
type PatchEntryPayload = InferRequestType<typeof $patchEntry>['json'];

const emptyEntry = () => ({ childPhrase: '', adultTranslation: '', notes: '', firstHeardOn: '' });

/**
 * Refreshes exactly the three caches an entry mutation can affect: the dictionary list (card counts),
 * this dictionary's detail (its `entryCount`), and its entries under every search/sort combination.
 *
 * Deliberately not awaited by callers — the mutation has already succeeded server-side, so blocking
 * the dialog close or toast on a refetch only adds latency.
 */
export function invalidateDictionary(queryClient: QueryClient, dictionaryId: number) {
  void queryClient.invalidateQueries({ queryKey: ['child-dictionaries', 'list'], exact: true });
  void queryClient.invalidateQueries({ queryKey: ['child-dictionaries', dictionaryId] });
}

/** Display format for the text input; matches the table's `DD. MM. YYYY`. Value stays ISO. */
const DATE_DISPLAY_FORMAT = 'dd. MM. yyyy';

/**
 * Accepted typing formats, tried in order. Day-first throughout — `new Date()` would read
 * "03. 07. 2026" as 7 March (US month-first), which is the wrong reading here.
 */
const DATE_INPUT_FORMATS = [
  'dd. MM. yyyy',
  'd. M. yyyy',
  'dd.MM.yyyy',
  'd.M.yyyy',
  'dd/MM/yyyy',
  'd/M/yyyy',
  'dd-MM-yyyy',
  'd-M-yyyy',
  'yyyy-MM-dd',
  'd MMMM yyyy',
  'd MMM yyyy',
];

/** Parses day-first input. Returns undefined for anything unparseable or out of range (31. 02.). */
function parseDayFirst(input: string) {
  const trimmed = input.trim();

  for (const dateFormat of DATE_INPUT_FORMATS) {
    const parsed = parse(trimmed, dateFormat, new Date());

    if (isValid(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

/**
 * ShadCN date-picker (input + calendar popover) bound to the `YYYY-MM-DD` string the API expects.
 * Typing is allowed for fast entry; the calendar covers the "which day was that?" case.
 */
function DateField({ id, onChange, value }: { id: string; onChange: (value: string) => void; value: string }) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const isValidSelection = selected && isValid(selected);

  // Local text so a half-typed date doesn't clobber the form value on every keystroke.
  const [text, setText] = useState(isValidSelection ? format(selected, DATE_DISPLAY_FORMAT) : '');

  const commitText = (input: string) => {
    if (input.trim() === '') {
      onChange('');
      setText('');
      return;
    }

    const parsed = parseDayFirst(input);

    if (parsed) {
      onChange(format(parsed, 'yyyy-MM-dd'));
      setText(format(parsed, DATE_DISPLAY_FORMAT));
      return;
    }

    // Unparseable: restore the last good value rather than silently keeping bad text.
    setText(isValidSelection ? format(selected, DATE_DISPLAY_FORMAT) : '');
  };

  return (
    <div className="relative flex gap-2">
      <Input
        className="pr-10"
        id={id}
        onBlur={(evt) => commitText(evt.target.value)}
        onChange={(evt) => setText(evt.target.value)}
        onKeyDown={(evt) => {
          if (evt.key === 'Enter') {
            evt.preventDefault();
            commitText(evt.currentTarget.value);
          }
        }}
        placeholder="dd. mm. yyyy"
        value={text}
      />
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button className="absolute top-1/2 right-1 size-7 -translate-y-1/2" type="button" variant="ghost">
            <CalendarIcon className="size-3.5" />
            <span className="sr-only">Pick a date</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto overflow-hidden p-0">
          <Calendar
            captionLayout="dropdown"
            // A word can only have been first heard in the past.
            disabled={{ after: new Date() }}
            mode="single"
            onSelect={(date) => {
              if (date) {
                onChange(format(date, 'yyyy-MM-dd'));
                setText(format(date, DATE_DISPLAY_FORMAT));
              }
              setOpen(false);
            }}
            selected={isValidSelection ? selected : undefined}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

/** Shared add/edit form. `entry` switches it from create to update. */
export function EntryForm({
  dictionaryId,
  entry,
  onDone,
}: {
  dictionaryId: number;
  entry?: DictionaryEntry;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(createChildDictionaryEntryModel),
    defaultValues: entry
      ? {
          childPhrase: entry.childPhrase,
          adultTranslation: entry.adultTranslation,
          notes: entry.notes ?? '',
          firstHeardOn: entry.firstHeardOn ?? '',
        }
      : emptyEntry(),
  });

  const { mutateAsync, isPending } = useMutation({
    mutationFn: async (json: CreateEntryPayload) =>
      entry
        ? parseResponse(
            $patchEntry({
              param: { id: dictionaryId.toString(), entryId: entry.id.toString() },
              json: json as PatchEntryPayload,
            })
          )
        : parseResponse($postEntry({ param: { id: dictionaryId.toString() }, json })),
  });

  const onSubmit: SubmitHandler<CreateEntryPayload> = async (data) => {
    try {
      await mutateAsync(data);
      invalidateDictionary(queryClient, dictionaryId);
      form.reset(emptyEntry());
      toast.success(entry ? 'Word updated.' : `"${data.childPhrase}" added.`);
      onDone();
    } catch {
      toast.error('Something went wrong.');
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="childPhrase"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Child phrase</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. nana" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="adultTranslation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Adult translation</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. banana" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="firstHeardOn"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor="firstHeardOn">First heard on (optional)</FormLabel>
              <FormControl>
                <DateField id="firstHeardOn" onChange={field.onChange} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes (optional)</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="When do they say it?" rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button loading={isPending} type="submit">
            {entry ? 'Save' : 'Add word'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const entriesTableBuilder = createColumnHelper<DictionaryEntry>();

export const entriesTableColumns = [
  entriesTableBuilder.accessor('childPhrase', {
    header: 'Child says',
    cell(info) {
      return (
        <span className={info.row.original.archived ? 'text-muted-foreground line-through' : 'font-medium'}>
          {info.getValue()}
        </span>
      );
    },
  }),
  entriesTableBuilder.accessor('adultTranslation', {
    header: 'Means',
    cell(info) {
      return <span className={info.row.original.archived ? 'text-muted-foreground' : ''}>{info.getValue()}</span>;
    },
  }),
  entriesTableBuilder.accessor('notes', {
    header: 'Notes',
    cell(info) {
      const notes = info.getValue();
      return notes ? (
        <span className="text-muted-foreground text-sm">{notes}</span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      );
    },
  }),
  entriesTableBuilder.accessor('firstHeardOn', {
    header: 'First heard',
    cell(info) {
      const date = info.getValue();
      return date ? (
        <span>{dayjs(date).format('DD. MM. YYYY')}</span>
      ) : (
        <span className="text-muted-foreground/60">—</span>
      );
    },
  }),
  entriesTableBuilder.accessor('creator', {
    header: 'Added by',
    cell(info) {
      const creator = info.getValue();

      if (!creator) {
        return <span className="text-muted-foreground/60">Unknown</span>;
      }

      return (
        <div className="flex items-center gap-2">
          <Avatar className="size-6">
            <AvatarImage alt={creator.name} src={creator.image || undefined} />
            <AvatarFallback>{creator.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <span className="text-sm">{creator.name}</span>
        </div>
      );
    },
  }),
  entriesTableBuilder.display({
    id: 'actions',
    header: '',
    cell: function EntriesTableActions(props) {
      const entry = props.row.original;
      const queryClient = useQueryClient();
      const [editOpen, setEditOpen] = useState(false);
      const [deleteOpen, setDeleteOpen] = useState(false);

      const { mutateAsync: patchEntryAsync } = useMutation({
        mutationFn: async (json: PatchEntryPayload) =>
          parseResponse(
            $patchEntry({ param: { id: entry.dictionaryId.toString(), entryId: entry.id.toString() }, json })
          ),
      });
      const { mutateAsync: deleteEntryAsync } = useMutation({
        mutationFn: async () =>
          parseResponse(
            client['child-dictionaries'][':id'].entries[':entryId'].$delete({
              param: { id: entry.dictionaryId.toString(), entryId: entry.id.toString() },
            })
          ),
      });

      const handleToggleArchived = async () => {
        try {
          await patchEntryAsync({ archived: !entry.archived });
          invalidateDictionary(queryClient, entry.dictionaryId);
          toast.success(entry.archived ? 'Word restored.' : 'Word archived.');
        } catch {
          toast.error('Something went wrong.');
        }
      };

      const handleDelete = async () => {
        try {
          await deleteEntryAsync();
          invalidateDictionary(queryClient, entry.dictionaryId);
          toast.success(`"${entry.childPhrase}" deleted.`);
        } catch {
          toast.error('Something went wrong.');
        }
      };

      return (
        <>
          <DropdownMenu>
            <div className="flex justify-end">
              <DropdownMenuTrigger asChild>
                <Button className="h-8 w-8 p-0" variant="ghost">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <PencilIcon />
                  Edit word
                </DropdownMenuItem>
                {/*
                 * Deliberately not wrapped in a Tooltip. A TooltipTrigger around an *enabled*
                 * DropdownMenuItem swallows its onClick. The household-members table gets away with
                 * the same pattern only because it renders TooltipContent conditionally, and the
                 * items are disabled whenever that content is present.
                 */}
                <DropdownMenuItem onClick={handleToggleArchived}>
                  {entry.archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                  {entry.archived ? 'Restore word' : 'Archive word'}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
                  <TrashIcon />
                  Delete word
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Dialog onOpenChange={setEditOpen} open={editOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit word</DialogTitle>
                <DialogDescription>Update what they say, what it means, or when you first heard it.</DialogDescription>
              </DialogHeader>
              <EntryForm dictionaryId={entry.dictionaryId} entry={entry} onDone={() => setEditOpen(false)} />
            </DialogContent>
          </Dialog>

          <ConfirmDeleteDialog
            confirmLabel="Delete word"
            description={
              <>
                "{entry.childPhrase}" ({entry.adultTranslation}) will be permanently deleted. If you just want to hide
                it, archive it instead.
              </>
            }
            onConfirm={handleDelete}
            onOpenChange={setDeleteOpen}
            open={deleteOpen}
            title="Delete this word?"
          />
        </>
      );
    },
  }),
];
