import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, retainSearchParams } from '@tanstack/react-router';
import { PlusIcon, ReceiptIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import z from 'zod';

import { searchQueryParam } from '@homewise/server/models';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
  DataTable,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  Spinner,
  useDataTable,
} from '@homewise/ui/core';

import { listExpenseCategoriesQueryOptions } from '@/modules/expense-categories';
import {
  defaultRecordedAt,
  ExpenseFormDialog,
  type ExpensesSummary,
  expensesSummaryQueryOptions,
  listExpensesQueryOptions,
} from '@/modules/expenses';
import { getMyHouseholdQueryOptions } from '@/modules/households';
import {
  Actionbar,
  currentMonth,
  currentYear,
  formatAmount,
  monthLabel,
  monthOptions,
  monthRange,
  PageLayout,
  RouteError,
  SearchInput,
  yearOptions,
} from '@/modules/shared';

import { expensesTableColumns } from './-expenses-table.config';

const searchParamsModel = z.object({
  /**
   * 1–12, so `?month=8` reads as August. The fallbacks are functions, not values: `.default(
   * currentMonth())` would be evaluated once when this chunk loads and hand back that same month for
   * the rest of the tab's life.
   */
  month: z.coerce
    .number<number>()
    .int()
    .min(1)
    .max(12)
    .optional()
    .catch(undefined)
    .transform((value) => value ?? currentMonth()),
  year: z.coerce
    .number<number>()
    .int()
    .min(1900)
    .max(3000)
    .optional()
    .catch(undefined)
    .transform((value) => value ?? currentYear()),
  search: searchQueryParam,
  /** A category id, or `none` for the expenses nobody has categorised. */
  category: z
    .union([z.literal('none'), z.number().int().positive()])
    .optional()
    .catch(undefined),
});

type SearchParams = z.infer<typeof searchParamsModel>;

const queryFor = ({ category, month, search, year }: SearchParams) => ({
  ...monthRange(month, year),
  category,
  search,
});

export const Route = createFileRoute('/_authenticated/_onboarded/expenses/monthly-expenses')({
  validateSearch: searchParamsModel,
  // What keeps the month you were looking at when the categories sheet opens over it and closes
  // again — without every link in the section having to thread `search` through by hand.
  search: { middlewares: [retainSearchParams(['month', 'year', 'search', 'category'])] },
  loaderDeps: ({ search }) => search,
  async loader({ context, deps }) {
    const range = monthRange(deps.month, deps.year);

    await Promise.all([
      context.queryClient.ensureQueryData(getMyHouseholdQueryOptions()),
      context.queryClient.ensureQueryData(listExpensesQueryOptions(queryFor(deps))),
      context.queryClient.ensureQueryData(expensesSummaryQueryOptions(range)),
      // Every row's picker reads this, and warming it here is what makes opening the categories
      // sheet instant rather than a spinner.
      context.queryClient.ensureQueryData(listExpenseCategoriesQueryOptions()),
    ]);
  },
  component: MonthlyExpensesLayout,
  pendingComponent: () => <Spinner />,
  // The categories sheet renders into this route's `Outlet`, so it's covered by this one too.
  errorComponent: () => <RouteError icon={ReceiptIcon} title="Couldn't load this month" />,
});

/**
 * The month's expenses.
 *
 * The whole page lives in the layout rather than in `index.tsx`, which is why that file renders
 * nothing: `/categories` is an overlay, not an alternative view, so the table has to stay mounted
 * underneath it. That also puts the search params here, where the sheet route inherits them.
 */
function MonthlyExpensesLayout() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();

  const [addOpen, setAddOpen] = useState(false);

  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());
  const range = monthRange(searchParams.month, searchParams.year);
  const { data: expenses } = useSuspenseQuery(listExpensesQueryOptions(queryFor(searchParams)));
  const { data: summary } = useSuspenseQuery(expensesSummaryQueryOptions(range));

  const setSearchParam = <Key extends keyof SearchParams>(key: Key, value: SearchParams[Key], replace = false) =>
    navigate({ search: { ...searchParams, [key]: value }, to: '.', replace });

  // Only the search value is debounced — debouncing the whole setter lets a month change land behind
  // a stale keystroke and get overwritten by it.

  // Both of these have to be stable references. A fresh arrow each render defeats the `useMemo`, so
  // the table rebuilds its column definitions on every realtime refetch — and an inline editor open
  // at the time is torn down mid-edit.
  const openCategories = useCallback(() => void navigate({ to: '/expenses/monthly-expenses/categories' }), [navigate]);

  const columns = useMemo(() => expensesTableColumns(openCategories), [openCategories]);
  const table = useDataTable({ columns, data: expenses.expenses });

  const months = useMemo(monthOptions, []);
  const years = useMemo(() => yearOptions(household.createdAt), [household.createdAt]);

  const isFiltered = Boolean(searchParams.search) || searchParams.category !== undefined;

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
            <BreadcrumbItem>Expenses</BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Monthly expenses</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <PageLayout>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-medium text-lg">{monthLabel(searchParams.month, searchParams.year)}</h1>
            <MonthTotals summary={summary} />
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <PlusIcon />
            Add expense
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select onValueChange={(value) => setSearchParam('month', Number(value))} value={String(searchParams.month)}>
            <SelectTrigger aria-label="Month" className="w-36">
              <span>{months.find((month) => month.value === searchParams.month)?.label}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Months</SelectLabel>
                {months.map((month) => (
                  <SelectItem key={month.value} value={String(month.value)}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select onValueChange={(value) => setSearchParam('year', Number(value))} value={String(searchParams.year)}>
            <SelectTrigger aria-label="Year" className="w-28">
              <span>{searchParams.year}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Years</SelectLabel>
                {years.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <SearchInput
            className="w-full sm:w-72"
            label="Search expenses"
            onChange={(next) => setSearchParam('search', next, true)}
            placeholder="Search expenses"
            value={searchParams.search}
          />

          <CategoryBreakdown
            onSelect={(category) => setSearchParam('category', category)}
            selected={searchParams.category}
            summary={summary}
          />
        </div>

        <DataTable
          emptyContent={
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ReceiptIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {isFiltered
                    ? 'No matching expenses'
                    : `Nothing logged for ${monthLabel(searchParams.month, searchParams.year)}`}
                </EmptyTitle>
                <EmptyDescription>
                  {isFiltered
                    ? 'Try a different search term, or clear the category filter.'
                    : 'Log what the household spent and the total and the breakdown build themselves.'}
                </EmptyDescription>
              </EmptyHeader>
              {!isFiltered && (
                <EmptyContent>
                  <Button onClick={() => setAddOpen(true)}>
                    <PlusIcon />
                    Add expense
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          }
          table={table}
        />

        <ExpenseFormDialog defaultRecordedAt={defaultRecordedAt(range.from)} onOpenChange={setAddOpen} open={addOpen} />
      </PageLayout>

      {/* The categories sheet renders here, over the table rather than instead of it. */}
      <Outlet />
    </>
  );
}

function MonthTotals({ summary }: { summary: ExpensesSummary }) {
  if (summary.totals.length === 0) {
    return <p className="text-muted-foreground text-sm">Nothing spent yet.</p>;
  }

  return (
    <div className="text-sm">
      {summary.totals.map((total) => (
        // A labelled number has no role of its own, so there is nothing semantic to select it by.
        <p data-testid="month-total" key={total.currency}>
          <span className="text-muted-foreground">Total </span>
          <span className="font-medium">{formatAmount(total.spent, total.currency)}</span>
          {total.paidBack > 0 && (
            <span className="text-muted-foreground">
              {' · '}
              {formatAmount(total.paidBack, total.currency)} paid back
            </span>
          )}
        </p>
      ))}
    </div>
  );
}

/** The month's spending per category, doubling as the category filter. */
function CategoryBreakdown({
  onSelect,
  selected,
  summary,
}: {
  onSelect: (category: SearchParams['category']) => void;
  selected: SearchParams['category'];
  summary: ExpensesSummary;
}) {
  if (summary.byCategory.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {summary.byCategory.map((slice) => {
        const value = slice.categoryId ?? 'none';
        const isSelected = selected === value;

        return (
          // The server groups by category *and* currency, so one category spending in two of them
          // comes back as two slices sharing a categoryId. The key has to carry both.
          <Button
            key={`${value}-${slice.currency}`}
            onClick={() => onSelect(isSelected ? undefined : value)}
            size="sm"
            variant={isSelected ? 'default' : 'outline'}
          >
            {slice.categoryName ?? 'Uncategorised'}
            <span className={isSelected ? undefined : 'text-muted-foreground'}>
              {formatAmount(slice.amount, slice.currency)}
            </span>
          </Button>
        );
      })}
      {selected !== undefined && (
        <Button onClick={() => onSelect(undefined)} size="sm" variant="ghost">
          Clear filter
        </Button>
      )}
    </div>
  );
}
