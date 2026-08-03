import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { CheckIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import z from 'zod';

import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Checkbox,
  Label,
  Spinner,
} from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { parseResponse } from '@/api/client';
import { Actionbar, serverMessage } from '@/modules/shared';
import {
  $createList,
  invalidateShoppingLists,
  listShoppingListsQueryOptions,
  remainingCount,
} from '@/modules/shopping-lists';

const searchParamsModel = z.object({
  /** Completed lists are hidden by default — the useful list is the one you haven't shopped yet. */
  includeCompleted: z.boolean().default(false).catch(false),
});

/** Search params are typed; the RPC query string wants strings. */
const toQuery = (search: { includeCompleted: boolean }) =>
  ({ includeCompleted: search.includeCompleted ? 'true' : 'false' }) as const;

export const Route = createFileRoute('/_authenticated/_onboarded/food/shopping-lists')({
  validateSearch: searchParamsModel,
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await context.queryClient.ensureQueryData(listShoppingListsQueryOptions(toQuery(deps)));
  },
  component: ShoppingListsLayout,
  pendingComponent: () => <Spinner />,
});

function ShoppingListsLayout() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const queryClient = useQueryClient();

  const { data: lists } = useSuspenseQuery(listShoppingListsQueryOptions(toQuery(searchParams)));

  // Which pane the small screen is showing. Two columns side by side don't fit under `md`, so the
  // master column steps aside once a list is open and the detail offers a way back.
  const isDetail = Boolean(matchRoute({ fuzzy: true, to: '/food/shopping-lists/$listId' }));

  const { mutateAsync: createList, isPending: isCreating } = useMutation({
    mutationFn: async () => parseResponse($createList({ json: {} })),
    onSuccess: (list) => {
      invalidateShoppingLists(queryClient);
      void navigate({ params: { listId: list.id.toString() }, to: '/food/shopping-lists/$listId' });
    },
  });

  const handleCreate = async () => {
    try {
      await createList();
    } catch (error) {
      toast.error(serverMessage(error, 'Something went wrong.'));
    }
  };

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
            <BreadcrumbItem>Food &amp; Groceries</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Shopping lists</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="flex-1 p-4">
        <div className="md:grid md:grid-cols-[18rem_minmax(0,1fr)] md:gap-6">
          <aside className={cn('space-y-4', isDetail && 'hidden md:block')}>
            <div className="flex items-start justify-between gap-2">
              <h1 className="font-medium text-lg">Shopping lists</h1>
              <Button loading={isCreating} onClick={handleCreate} size="sm">
                <PlusIcon />
                New list
              </Button>
            </div>

            <Label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={searchParams.includeCompleted}
                onCheckedChange={(checked) => navigate({ search: { includeCompleted: checked === true }, to: '.' })}
              />
              Show completed
            </Label>

            {lists.length === 0 ? (
              <p className="text-muted-foreground text-sm">No lists yet. Start one and add what you need to buy.</p>
            ) : (
              <ul className="space-y-1">
                {lists.map((list) => (
                  <li key={list.id}>
                    <Link
                      activeProps={{ className: 'bg-accent' }}
                      className="block rounded-md px-3 py-2 text-sm hover:bg-accent"
                      params={{ listId: list.id.toString() }}
                      to="/food/shopping-lists/$listId"
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium">{list.label}</span>
                        {list.completedAt && (
                          <Badge className="shrink-0" variant="secondary">
                            <CheckIcon />
                            Done
                          </Badge>
                        )}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {list.itemCount === 0
                          ? 'Empty'
                          : `${list.checkedCount} of ${list.itemCount} ticked${
                              remainingCount(list) > 0 ? '' : ' — all done'
                            }`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* A layout column, not a `section` — the list's own headings are the real sections, and a
              wrapper that also matched `section` would contain every one of them. */}
          <div className={cn('min-w-0', !isDetail && 'hidden md:block')}>
            <Outlet />
          </div>
        </div>
      </main>
    </>
  );
}
