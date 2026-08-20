import { createFileRoute, Link, Outlet, useMatchRoute } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@homewise/ui/core';

import { IngredientFormDialog } from '@/modules/ingredients';
import { Actionbar, Can, PageLayout } from '@/modules/shared';
import { StoreFormDialog } from '@/modules/stores';

export const Route = createFileRoute('/_authenticated/_onboarded/food/ingredients')({
  component: IngredientsLayout,
});

/**
 * Shared chrome for the pantry vocabulary: the ingredient library and the shops those ingredients
 * are bought at. Both are the same kind of reference data, so they're tabs here rather than two
 * sidebar entries — and the tabs are real routes, so each owns its own loader and search params.
 *
 * Unlike the kid-profile tabs, `index.tsx` isn't a redirect to a default tab: `/food/ingredients`
 * already *is* the ingredient list and is a live URL worth keeping.
 */
function IngredientsLayout() {
  const matchRoute = useMatchRoute();
  const [addOpen, setAddOpen] = useState(false);

  const onStores = Boolean(matchRoute({ to: '/food/ingredients/stores' }));

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
              {onStores ? (
                <BreadcrumbLink asChild>
                  <Link to="/food/ingredients">Ingredients</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>Ingredients</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {onStores && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Shops</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <PageLayout>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-medium text-lg">Ingredients</h1>
            <p className="text-muted-foreground text-sm">
              Your pantry vocabulary. Recipes reference these, and shopping lists add them up — grouped by the shop you
              buy them at.
            </p>
          </div>
          <Can access="write" area="ingredients">
            <Button onClick={() => setAddOpen(true)}>
              <PlusIcon />
              {onStores ? 'Add shop' : 'Add ingredient'}
            </Button>
          </Can>
        </div>

        <Tabs value={onStores ? 'stores' : 'ingredients'}>
          <TabsList>
            <TabsTrigger asChild value="ingredients">
              <Link to="/food/ingredients">Ingredients</Link>
            </TabsTrigger>
            <TabsTrigger asChild value="stores">
              <Link to="/food/ingredients/stores">Shops</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Outlet />

        {/* Keyed off the tab, so only the dialog the button opens is ever mounted. */}
        {onStores ? (
          <StoreFormDialog onOpenChange={setAddOpen} open={addOpen} />
        ) : (
          <IngredientFormDialog onOpenChange={setAddOpen} open={addOpen} />
        )}
      </PageLayout>
    </>
  );
}
