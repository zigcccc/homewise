import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type z from 'zod';

import { createStorageLocationModel } from '@homewise/server/storage-locations';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@homewise/ui/core';

import { parseResponse } from '@/api/client';
import { isServerStatus, serverMessage } from '@/modules/shared';
import { invalidateStorageItems } from '@/modules/storage-items';

import {
  $createStorageLocation,
  $patchStorageLocation,
  invalidateStorageLocations,
  type StorageLocation,
} from '../storage-locations.queries';
import { LocationMapField } from './location-map-field';

type LocationFormValues = z.infer<typeof createStorageLocationModel>;

/**
 * Add/edit dialog for a place. The form body is mounted inside `DialogContent`, which Radix unmounts
 * on close — so `defaultValues` reseed on every open with no reset effect.
 */
export function LocationFormDialog({
  location,
  onOpenChange,
  open,
}: {
  location?: StorageLocation;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{location ? 'Edit location' : 'Add a storage location'}</DialogTitle>
          <DialogDescription>
            {location
              ? 'Renaming it relabels every item stored here.'
              : 'A place you keep things — the garage, the cellar, a storage unit across town.'}
          </DialogDescription>
        </DialogHeader>
        <LocationForm location={location} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function LocationForm({ location, onDone }: { location?: StorageLocation; onDone: () => void }) {
  const queryClient = useQueryClient();

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(createStorageLocationModel),
    defaultValues: {
      name: location?.name ?? '',
      address: location?.address ?? '',
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
    },
  });

  const { mutateAsync: save } = useMutation({
    mutationFn: async (json: LocationFormValues) =>
      location
        ? parseResponse($patchStorageLocation({ param: { id: location.id.toString() }, json }))
        : parseResponse($createStorageLocation({ json })),
  });

  const submit: SubmitHandler<LocationFormValues> = async (values) => {
    try {
      await save(values);
      toast.success(location ? 'Location updated.' : `"${values.name}" added.`);
      invalidateStorageLocations(queryClient);
      // Every item carries its location's name in the row it renders, so a rename relabels the item
      // lists too — which is exactly what this dialog's description promises.
      invalidateStorageItems(queryClient);
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

  const latitude = form.watch('latitude');
  const longitude = form.watch('longitude');
  const pin = latitude != null && longitude != null ? { latitude, longitude } : null;

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
                <Input {...field} placeholder="e.g. Garage" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Optional — where to find it" value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="latitude"
          render={() => (
            <FormItem>
              <FormLabel>Pin on the map</FormLabel>
              <FormControl>
                <LocationMapField
                  onAddressResolved={(address) => form.setValue('address', address, { shouldDirty: true })}
                  onChange={(next) => {
                    // The two halves are one value — the server refuses half a pair.
                    form.setValue('latitude', next?.latitude ?? null, { shouldDirty: true });
                    form.setValue('longitude', next?.longitude ?? null, { shouldDirty: true });
                  }}
                  value={pin}
                />
              </FormControl>
              <FormDescription>Search for a place or click the map. Optional.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button loading={form.formState.isSubmitting} type="submit">
            {location ? 'Save changes' : 'Add location'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
