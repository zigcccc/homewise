import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { CarrotIcon, MoreHorizontal, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useDebounceCallback } from 'usehooks-ts';
import z from 'zod';

import {
  createIngredientModel,
  ingredientCategory,
  ingredientSortDirection,
  ingredientSortKey,
  measurementUnit,
} from '@homewise/server/ingredients';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Spinner,
  Textarea,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import {
  type Ingredient,
  ingredientCategoryLabels,
  invalidateIngredients,
  listIngredientsQueryOptions,
  measurementUnitLabels,
} from '@/modules/ingredients';
import { Actionbar, ConfirmDeleteDialog, serverMessage } from '@/modules/shared';

const ALL = 'all';
const NONE = 'none';

const $createIngredient = client.ingredients.$post;
const $patchIngredient = client.ingredients[':id'].$patch;
const $deleteIngredient = client.ingredients[':id'].$delete;

const searchParamsModel = z.object({
  search: z
    .string()
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  category: ingredientCategory.optional().catch(undefined),
  sortKey: ingredientSortKey.default('name').catch('name'),
  sortDirection: ingredientSortDirection.default('asc').catch('asc'),
});

type SearchParams = z.infer<typeof searchParamsModel>;

export const Route = createFileRoute('/_authenticated/_onboarded/food/ingredients/')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await context.queryClient.ensureQueryData(listIngredientsQueryOptions(deps));
  },
  component: IngredientsRoute,
  pendingComponent: () => <Spinner />,
});

function IngredientsRoute() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();

  const [addOpen, setAddOpen] = useState(false);

  const { data: ingredients } = useSuspenseQuery(listIngredientsQueryOptions(searchParams));

  const setSearchParam = <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key]) =>
    navigate({ to: '.', search: { ...searchParams, [key]: value } });

  const debouncedSearch = useDebounceCallback((value: string) => setSearchParam('search', value || undefined), 400);

  const table = useReactTable({ data: ingredients, columns: ingredientColumns, getCoreRowModel: getCoreRowModel() });

  const isFiltered = Boolean(searchParams.search || searchParams.category);

  return (
    <>
      <Actionbar.Content>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>Food & Groceries</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Ingredients</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 space-y-6 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-medium text-lg">Ingredients</h1>
            <p className="text-muted-foreground text-sm">
              Your pantry vocabulary. Recipes reference these, and shopping lists will add them up.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon />
            Add ingredient
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <InputGroup className="w-full sm:w-auto sm:flex-1">
            <InputGroupInput
              defaultValue={searchParams.search ?? ''}
              onChange={(evt) => debouncedSearch(evt.target.value)}
              placeholder="Search ingredients"
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>

          <Select
            onValueChange={(value) => setSearchParam('category', value === ALL ? undefined : (value as never))}
            value={searchParams.category ?? ALL}
          >
            <SelectTrigger className="w-48">
              <span>{searchParams.category ? ingredientCategoryLabels[searchParams.category] : 'Any category'}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any category</SelectItem>
              {ingredientCategory.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {ingredientCategoryLabels[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            onClick={() => setSearchParam('sortDirection', searchParams.sortDirection === 'asc' ? 'desc' : 'asc')}
            variant="outline"
          >
            {searchParams.sortDirection === 'asc' ? 'A → Z' : 'Z → A'}
          </Button>
        </div>

        <DataTable
          emptyContent={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CarrotIcon />
                </EmptyMedia>
                <EmptyTitle>{isFiltered ? 'No matching ingredients' : 'No ingredients yet'}</EmptyTitle>
                <EmptyDescription>
                  {isFiltered
                    ? 'Try a different search term or clear the category filter.'
                    : 'Add the staples you cook with — or let them build up as you write recipes.'}
                </EmptyDescription>
              </EmptyHeader>
              {!isFiltered && (
                <EmptyContent>
                  <Button onClick={() => setAddOpen(true)}>
                    <PlusIcon />
                    Add ingredient
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          }
          table={table}
        />

        <IngredientFormDialog onOpenChange={setAddOpen} open={addOpen} />
      </main>
    </>
  );
}

const columnHelper = createColumnHelper<Ingredient>();

const ingredientColumns = [
  columnHelper.accessor('name', { header: 'Name' }),
  columnHelper.accessor('category', {
    header: 'Category',
    cell: (info) => ingredientCategoryLabels[info.getValue()],
  }),
  columnHelper.accessor('defaultUnit', {
    header: 'Default unit',
    cell: (info) => {
      const unit = info.getValue();
      return unit ? measurementUnitLabels[unit] : '—';
    },
  }),
  columnHelper.accessor('recipeCount', {
    header: 'Used in',
    cell: (info) => {
      const count = info.getValue();
      return `${count} ${count === 1 ? 'recipe' : 'recipes'}`;
    },
  }),
  columnHelper.display({
    id: 'actions',
    header: '',
    cell: (info) => <IngredientRowActions ingredient={info.row.original} />,
  }),
];

/** Row menu: edit opens the same dialog in edit mode, delete confirms and surfaces the in-use 409. */
function IngredientRowActions({ ingredient }: { ingredient: Ingredient }) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { mutateAsync: deleteIngredient } = useMutation({
    mutationFn: async () => parseResponse($deleteIngredient({ param: { id: ingredient.id.toString() } })),
  });

  const handleDelete = async () => {
    try {
      await deleteIngredient();
      toast.success(`"${ingredient.name}" deleted.`);
      invalidateIngredients(queryClient);
    } catch (error) {
      // The server refuses while any recipe still uses it — show that reason, not a generic failure.
      toast.error(serverMessage(error, 'Something went wrong.'));
      throw error;
    }
  };

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="h-8 w-8 p-0" variant="ghost">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <PencilIcon />
            Edit ingredient
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeleteOpen(true)} variant="destructive">
            <TrashIcon />
            Delete ingredient
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <IngredientFormDialog ingredient={ingredient} onOpenChange={setEditOpen} open={editOpen} />

      <ConfirmDeleteDialog
        // The server refuses while any recipe still uses it, so confirming could only ever produce a
        // 409 — block it here and let the description say why.
        confirmDisabled={ingredient.recipeCount > 0}
        confirmLabel="Delete ingredient"
        description={
          ingredient.recipeCount > 0 ? (
            <>
              "{ingredient.name}" is used in {ingredient.recipeCount}{' '}
              {ingredient.recipeCount === 1 ? 'recipe' : 'recipes'}. Remove it from them before deleting it.
            </>
          ) : (
            <>"{ingredient.name}" will be permanently removed from your ingredient library.</>
          )
        }
        onConfirm={handleDelete}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        title={`Delete "${ingredient.name}"?`}
      />
    </div>
  );
}

/**
 * The server model defaults `category`, which makes it optional on the way in and required on the
 * way out — a split `useForm` can't reconcile. The form always picks one, so require it here and
 * inherit every other field rule from the server.
 */
const ingredientFormModel = createIngredientModel.extend({ category: ingredientCategory });

type IngredientFormValues = z.infer<typeof ingredientFormModel>;

/**
 * Add/edit dialog for a library ingredient. The form body is mounted inside `DialogContent`, which
 * Radix unmounts on close — so `defaultValues` reseed on every open with no reset effect.
 */
function IngredientFormDialog({
  ingredient,
  onOpenChange,
  open,
}: {
  ingredient?: Ingredient;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ingredient ? 'Edit ingredient' : 'Add ingredient'}</DialogTitle>
          <DialogDescription>
            {ingredient
              ? 'Renaming it updates every recipe that uses it.'
              : 'The category decides where it lands on a shopping list.'}
          </DialogDescription>
        </DialogHeader>
        <IngredientForm ingredient={ingredient} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function IngredientForm({ ingredient, onDone }: { ingredient?: Ingredient; onDone: () => void }) {
  const queryClient = useQueryClient();

  const form = useForm<IngredientFormValues>({
    resolver: zodResolver(ingredientFormModel),
    defaultValues: {
      name: ingredient?.name ?? '',
      category: ingredient?.category ?? 'other',
      defaultUnit: ingredient?.defaultUnit ?? null,
      notes: ingredient?.notes ?? '',
    },
  });

  const { mutateAsync: save } = useMutation({
    mutationFn: async (json: IngredientFormValues) =>
      ingredient
        ? parseResponse($patchIngredient({ param: { id: ingredient.id.toString() }, json }))
        : parseResponse($createIngredient({ json })),
  });

  const submit: SubmitHandler<IngredientFormValues> = async (values) => {
    try {
      await save(values);
      toast.success(ingredient ? 'Ingredient updated.' : `"${values.name}" added.`);
      invalidateIngredients(queryClient);
      onDone();
    } catch (error) {
      // A duplicate name comes back as a 409 naming the conflict — put it on the field.
      form.setError('name', { message: serverMessage(error, 'Something went wrong.') });
    }
  };

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(submit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="e.g. Smoked paprika" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <span>{ingredientCategoryLabels[field.value]}</span>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ingredientCategory.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {ingredientCategoryLabels[option]}
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
            name="defaultUnit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default unit</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value === NONE ? null : value)}
                  value={field.value ?? NONE}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <span>{field.value ? measurementUnitLabels[field.value] : 'None'}</span>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {measurementUnit.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {measurementUnitLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea {...field} placeholder="Brand, where to buy it, …" value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button loading={form.formState.isSubmitting} type="submit">
            {ingredient ? 'Save changes' : 'Add ingredient'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
