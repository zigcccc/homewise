import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, retainSearchParams, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { CheckIcon, CookingPotIcon, ListTodoIcon, PlusIcon } from 'lucide-react';
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Label,
  Spinner,
} from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { parseResponse } from '@/api/client';
import { Actionbar, serverMessage } from '@/modules/shared';
import {
  $createList,
  invalidateShoppingLists,
  listQueryFor,
  listShoppingListsQueryOptions,
  listTitle,
  remainingCount,
} from '@/modules/shopping-lists';

const searchParamsModel = z.object({
  /**
   * Completed lists are hidden by default — the useful list is the one you haven't shopped yet.
   *
   * Absent rather than `false` when it's off, and deliberately not `.default(false)`: the param is
   * retained across every navigation inside the section (see below), and a default is a value like
   * any other, so it would be retained too — stamping `?includeCompleted=false` onto every link here.
   */
  includeCompleted: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute('/_authenticated/_onboarded/food/shopping-lists')({
  validateSearch: searchParamsModel,
  /**
   * The filter belongs to the section, not to one screen in it.
   *
   * Search params are not inherited across a navigation by default, so every link *inside* this
   * section used to drop the very param it was found under — and `$listId`'s loader, seeing the
   * filter off, redirected a completed list straight back out. Turning "Show completed" on was
   * therefore self-undoing: the index route's auto-select `<Navigate>` bounced off the first
   * completed list and back to the unfiltered column, and clicking one by hand did the same.
   */
  search: { middlewares: [retainSearchParams(['includeCompleted'])] },
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    await context.queryClient.ensureQueryData(listShoppingListsQueryOptions(listQueryFor(deps)));
  },
  component: ShoppingListsLayout,
  pendingComponent: () => <Spinner />,
});

function ShoppingListsLayout() {
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const queryClient = useQueryClient();

  const { data: lists } = useSuspenseQuery(listShoppingListsQueryOptions(listQueryFor(searchParams)));

  // Which pane the small screen is showing. Two columns side by side don't fit under `md`, so the
  // master column steps aside once a list is open and the detail offers a way back.
  const isDetail =
    Boolean(matchRoute({ fuzzy: true, to: '/food/shopping-lists/$listId' })) ||
    Boolean(matchRoute({ to: '/food/shopping-lists/import' }));

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

      <main className="flex-1 space-y-6 p-4">
        {/* Full width, whatever the columns below are doing — the actions belong to the page, not
            to the master column. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-medium text-lg">Shopping lists</h1>
          <div className="flex items-center gap-4">
            <Label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={searchParams.includeCompleted ?? false}
                // Off drops the param rather than writing `false`, which is what keeps it out of every
                // link the section retains it onto.
                onCheckedChange={(checked) =>
                  navigate({ search: { includeCompleted: checked === true ? true : undefined }, to: '.' })
                }
              />
              Show completed
            </Label>
            <Button asChild size="sm" variant="outline">
              <Link search={{ target: 'new' }} to="/food/shopping-lists/import">
                <CookingPotIcon />
                From meal plan
              </Link>
            </Button>
            <Button loading={isCreating} onClick={handleCreate} size="sm">
              <PlusIcon />
              New list
            </Button>
          </div>
        </div>

        {/* Nothing to put beside, so nothing beside it. A completed list doesn't count while the
            filter hides it — the detail route redirects out rather than lingering in an empty shell.
            `!isDetail` is load-bearing: importing from the meal plan is exactly what you do when the
            household has no lists, and without it that route renders into nothing. */}
        {lists.length === 0 && !isDetail ? (
          <Empty className="min-h-[60vh]">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ListTodoIcon />
              </EmptyMedia>
              <EmptyTitle>No shopping lists yet</EmptyTitle>
              <EmptyDescription>Start one and add what you need to buy.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button loading={isCreating} onClick={handleCreate}>
                <PlusIcon />
                New list
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-6">
            <aside className={cn(isDetail && 'hidden md:block')}>
              {/* Only reachable with a detail route open — importing with no lists yet. */}
              {lists.length === 0 && <p className="px-3 py-2 text-muted-foreground text-sm">No lists yet.</p>}
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
                        <span className="min-w-0 flex-1 truncate font-medium">{listTitle(list)}</span>
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
            </aside>

            {/* A layout column, not a `section` — the list's own headings are the real sections, and
                a wrapper that also matched `section` would contain every one of them. */}
            <div className={cn('min-w-0', !isDetail && 'hidden md:block')}>
              <Outlet />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
