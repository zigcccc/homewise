import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type z from 'zod';

import { createStoreModel } from '@homewise/server/stores';
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
  Textarea,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { isServerStatus, serverMessage } from '@/modules/shared';

import { $createStore, $patchStore, invalidateStores, type Store } from '../stores.queries';

type StoreFormValues = z.infer<typeof createStoreModel>;

/**
 * Add/edit dialog for a shop. The form body is mounted inside `DialogContent`, which Radix unmounts
 * on close — so `defaultValues` reseed on every open with no reset effect.
 */
export function StoreFormDialog({
  onOpenChange,
  open,
  store,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  store?: Store;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{store ? 'Edit shop' : 'Add shop'}</DialogTitle>
          <DialogDescription>
            {store
              ? 'Renaming it relabels every ingredient and shopping list section that points here.'
              : 'Ingredients you assign to a shop get their own section on a shopping list.'}
          </DialogDescription>
        </DialogHeader>
        <StoreForm onDone={() => onOpenChange(false)} store={store} />
      </DialogContent>
    </Dialog>
  );
}

function StoreForm({ onDone, store }: { onDone: () => void; store?: Store }) {
  const queryClient = useQueryClient();

  const form = useForm<StoreFormValues>({
    resolver: zodResolver(createStoreModel),
    defaultValues: {
      name: store?.name ?? '',
      notes: store?.notes ?? '',
    },
  });

  const { mutateAsync: save } = useMutation({
    mutationFn: async (json: StoreFormValues) =>
      store
        ? parseResponse($patchStore({ param: { id: store.id.toString() }, json }))
        : parseResponse($createStore({ json })),
  });

  const submit: SubmitHandler<StoreFormValues> = async (values) => {
    try {
      await save(values);
      toast.success(store ? 'Shop updated.' : `"${values.name}" added.`);
      invalidateStores(queryClient);
      onDone();
    } catch (error) {
      const message = serverMessage(error, 'Something went wrong.');

      // A duplicate name comes back as a 409 naming the conflict — that one is about the value, so it
      // goes on the field. Anything else has nothing to do with what was typed.
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
                <Input {...field} placeholder="e.g. Spar" />
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
                <Textarea {...field} placeholder="Which branch, opening hours, …" value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button loading={form.formState.isSubmitting} type="submit">
            {store ? 'Save changes' : 'Add shop'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
