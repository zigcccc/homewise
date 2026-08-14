import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type z from 'zod';

import { createIngredientModel, ingredientCategory } from '@homewise/server/ingredients';
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
  Input,
  Select,
  SelectContent,
  SelectTrigger,
  Textarea,
} from '@homewise/ui/core';

import { client, parseResponse } from '@/api/client';
import { isServerStatus, SELECT_NONE, serverMessage } from '@/modules/shared';
import { invalidateStores, StoreCombobox, storeChoiceModel } from '@/modules/stores';

import { ingredientCategoryLabels, measurementUnitLabels } from '../helpers';
import { type Ingredient, invalidateIngredients } from '../ingredients.queries';
import { IngredientCategorySelectItems, MeasurementUnitSelectItems } from './ingredient-select-items';

const $createIngredient = client.ingredients.$post;
const $patchIngredient = client.ingredients[':id'].$patch;

/**
 * The server model defaults `category`, which makes it optional on the way in and required on the
 * way out — a split `useForm` can't reconcile. The form always picks one, so require it here.
 * `storeId` and `storeName` are two halves of one choice, so the form holds the choice and `save`
 * writes both from it. Every other field rule is inherited from the server.
 */
const ingredientFormModel = createIngredientModel.omit({ storeId: true, storeName: true }).extend({
  category: ingredientCategory,
  store: storeChoiceModel,
});

type IngredientFormValues = z.infer<typeof ingredientFormModel>;

/**
 * Add/edit dialog for a library ingredient, and the only way to reach the fields the table doesn't
 * show. The form body is mounted inside `DialogContent`, which Radix unmounts on close — so
 * `defaultValues` reseed on every open with no reset effect.
 */
export function IngredientFormDialog({
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
      store: ingredient?.store ? { kind: 'existing', store: ingredient.store } : { kind: 'none' },
      notes: ingredient?.notes ?? '',
    },
  });

  const { mutateAsync: save } = useMutation({
    mutationFn: async ({ store, ...values }: IngredientFormValues) => {
      const json = {
        ...values,
        storeId: store.kind === 'existing' ? store.store.id : null,
        storeName: store.kind === 'new' ? store.name : undefined,
      };

      return ingredient
        ? parseResponse($patchIngredient({ param: { id: ingredient.id.toString() }, json }))
        : parseResponse($createIngredient({ json }));
    },
  });

  const submit: SubmitHandler<IngredientFormValues> = async (values) => {
    try {
      await save(values);
      toast.success(ingredient ? 'Ingredient updated.' : `"${values.name}" added.`);
      invalidateIngredients(queryClient);

      // The save may have minted a shop along the way, so the pickers and the Shops tab are stale.
      if (values.store.kind === 'new') {
        invalidateStores(queryClient);
      }

      onDone();
    } catch (error) {
      const message = serverMessage(error, 'Something went wrong.');

      // A duplicate name comes back as a 409 naming the conflict — that one is about the value, so it
      // goes on the field. Anything else (a 500, a dropped connection) has nothing to do with what was
      // typed and would misattribute the failure sitting under the name input.
      if (isServerStatus(error, 409)) {
        form.setError('name', { message });

        return;
      }

      toast.error(message);
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
                    <IngredientCategorySelectItems />
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
                  onValueChange={(value) => field.onChange(value === SELECT_NONE ? null : value)}
                  value={field.value ?? SELECT_NONE}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <span>{field.value ? measurementUnitLabels[field.value] : 'None'}</span>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <MeasurementUnitSelectItems noneLabel="None" />
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="store"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shop</FormLabel>
              <FormControl>
                <StoreCombobox onChange={field.onChange} value={field.value} />
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
