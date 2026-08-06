import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Suspense } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

import { optionalText } from '@homewise/server/models';
import { storageItemName, storageItemQuantity } from '@homewise/server/storage-items';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  ImageInput,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Textarea,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { serverMessage } from '@/modules/shared';
import { invalidateStorageLocations, listStorageLocationOptionsQueryOptions } from '@/modules/storage-locations';

import {
  $createStorageItem,
  $patchStorageItem,
  invalidateStorageItems,
  type StorageItem,
} from '../storage-items.queries';

/**
 * What the *controls* hold, which is not what the wire carries: the endpoint is multipart, so the
 * numbers reach it as strings and its model coerces them back. The bounds are still the server's —
 * only the two ids and the picture, which have no column of their own, are declared here.
 */
const itemFormModel = z.object({
  image: z.string().nullish(),
  imageFile: z.instanceof(File).nullish(),
  locationId: z.number().int().positive({ error: 'Pick a storage location' }),
  name: storageItemName,
  notes: optionalText(1000, 'Notes'),
  quantity: storageItemQuantity,
});

type ItemFormValues = z.infer<typeof itemFormModel>;

/** Photo resolves upload → clear → leave alone, matching the server. */
function resolveImage(values: ItemFormValues, current: string | null | undefined) {
  if (values.imageFile instanceof File) {
    return values.imageFile;
  }

  return !values.image && current ? '' : undefined;
}

/**
 * Add/edit dialog for a stored thing. The form body is mounted inside `DialogContent`, which Radix
 * unmounts on close — so `defaultValues` reseed on every open with no reset effect.
 *
 * `locationId` seeds from the item being edited, or from the location whose page this was opened on.
 */
export function ItemFormDialog({
  item,
  locationId,
  onOpenChange,
  open,
}: {
  item?: StorageItem;
  locationId?: number;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? 'Edit item' : 'Add an item'}</DialogTitle>
          <DialogDescription>
            {item
              ? 'Change what it is, how many there are, or where it lives.'
              : 'Something you keep somewhere — a photo of the box beats any label.'}
          </DialogDescription>
        </DialogHeader>
        {/* A dialog that loads its own data must catch its own suspense. `useSuspenseQuery` inside the
            form would otherwise reach the *route's* boundary and replace the whole page behind this
            dialog with a spinner while it fetches. */}
        <Suspense fallback={<Spinner className="min-h-64" />}>
          <ItemForm item={item} locationId={locationId} onDone={() => onOpenChange(false)} />
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({ item, locationId, onDone }: { item?: StorageItem; locationId?: number; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: locations } = useSuspenseQuery(listStorageLocationOptionsQueryOptions());

  const form = useForm<ItemFormValues>({
    resolver: zodResolver(itemFormModel),
    defaultValues: {
      image: item?.photoUrl ?? undefined,
      imageFile: undefined,
      locationId: item?.locationId ?? locationId ?? locations[0]?.id ?? 0,
      name: item?.name ?? '',
      notes: item?.notes ?? '',
      quantity: item?.quantity ?? 1,
    },
  });

  /**
   * The two endpoints want the same values typed differently: Hono infers a **required** multipart
   * field as the raw `ParsedFormValue` the wire carries and an optional one as the type the model
   * coerces it to — so create takes strings where patch takes numbers. `FormData` stringifies either
   * on the way out, so this is a typing difference and nothing more.
   */
  const { mutateAsync: save } = useMutation({
    mutationFn: async (values: ItemFormValues) => {
      const image = resolveImage(values, item?.photoUrl);
      // Omitted entirely when unchanged — the server reads a missing key as "leave the photo alone".
      const shared = {
        ...(image === undefined ? {} : { image }),
        notes: values.notes ?? '',
        quantity: values.quantity,
      };

      return item
        ? parseResponse(
            $patchStorageItem({
              param: { id: item.id.toString() },
              form: { ...shared, locationId: values.locationId, name: values.name },
            })
          )
        : parseResponse(
            $createStorageItem({ form: { ...shared, locationId: values.locationId.toString(), name: values.name } })
          );
    },
  });

  const submit: SubmitHandler<ItemFormValues> = async (values) => {
    try {
      await save(values);
      toast.success(item ? 'Item updated.' : `"${values.name}" added.`);
      invalidateStorageItems(queryClient);
      // The counts on both the old and the new location just moved.
      invalidateStorageLocations(queryClient);
      onDone();
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

  const image = form.watch('image');

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
        <div className="flex items-start gap-6">
          <FormField
            control={form.control}
            name="imageFile"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="sr-only">Photo</FormLabel>
                <FormControl>
                  <ImageInput
                    currentImage={image}
                    name={field.name}
                    onChange={(file) => form.setValue('imageFile', file, { shouldDirty: true })}
                    onImagePreview={(preview) => form.setValue('image', preview, { shouldDirty: true })}
                    placeholder="Add a photo"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex-1 space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g. Winter tyres" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>How many</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      min={1}
                      onChange={(event) => field.onChange(event.target.valueAsNumber)}
                      type="number"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="locationId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Location</FormLabel>
              <Select onValueChange={(value) => field.onChange(Number(value))} value={field.value.toString()}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Where is it kept?" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {locations.map((location) => (
                    <SelectItem key={location.id} value={location.id.toString()}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Which shelf, what's in the box, …" value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button loading={form.formState.isSubmitting} type="submit">
            {item ? 'Save changes' : 'Add item'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
