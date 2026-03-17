import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from '@homewise/ui/core/breadcrumb';
import { Button } from '@homewise/ui/core/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@homewise/ui/core/input-group';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from '@homewise/ui/core/select';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import dayjs from 'dayjs';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useDebounceCallback } from 'usehooks-ts';
import z from 'zod';

import { getMyHouseholdQueryOptions } from '@/modules/households';

import { Actionbar } from '../../-components/Actionbar';

const monthlyExpensesSearchParamsModel = z.object({
  month: z.coerce.number<number>().min(0).max(11).default(dayjs().month()),
  year: z.coerce.number<number>().min(1900).max(3000).default(dayjs().year()),
  search: z
    .string()
    .transform((val) => (val === '' ? undefined : val))
    .optional(),
});

export const Route = createFileRoute('/_authenticated/_onboarded/expenses/monthly-expenses')({
  validateSearch: monthlyExpensesSearchParamsModel,
  async loader({ context }) {
    await Promise.all([context.queryClient.ensureQueryData(getMyHouseholdQueryOptions())]);
  },
  component: MonthlyExpensesRoute,
});

function MonthlyExpensesRoute() {
  const searchParams = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: household } = useSuspenseQuery(getMyHouseholdQueryOptions());

  const monthsOptions = useMemo(() => {
    return Array.from({ length: 12 }).map((_, idx) => ({
      label: dayjs().month(idx).format('MMMM'),
      value: idx,
    }));
  }, []);

  const yearsOptions = useMemo(() => {
    const yearsDiff = dayjs().year() - dayjs(household.createdAt).year();

    return Array.from({ length: yearsDiff + 1 }).map((_, idx) => ({
      label: dayjs().year() - idx,
      value: dayjs().year() - idx,
    }));
  }, [household.createdAt]);

  const handleFilterChange = <FilterName extends keyof typeof searchParams>(filterName: FilterName, value: string) => {
    navigate({ to: '.', search: { ...searchParams, [filterName]: value } });
  };

  const debouncedSearchChange = useDebounceCallback(handleFilterChange, 400);

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
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to=".">Expenses</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Monthly expenses</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Actionbar.Content>

      <main className="p-4">
        <div className="flex items-center gap-2">
          <Select onValueChange={(val) => handleFilterChange('month', val)} value={searchParams.month.toString()}>
            <SelectTrigger className="w-30">
              <SelectValue placeholder="Select a month" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Months</SelectLabel>
                {monthsOptions.map((month) => (
                  <SelectItem value={month.value.toString()}>{month.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select onValueChange={(val) => handleFilterChange('year', val)} value={searchParams.year.toString()}>
            <SelectTrigger className="w-30">
              <SelectValue placeholder="Select a year" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Years</SelectLabel>
                {yearsOptions.map((year) => (
                  <SelectItem value={year.value.toString()}>{year.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <InputGroup>
            <InputGroupInput
              defaultValue={searchParams.search}
              onChange={(evt) => debouncedSearchChange('search', evt.target.value)}
              placeholder="Search by expense title or amount"
            />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>

          <Button>
            <PlusIcon />
            Add expense
          </Button>
        </div>
        Hello "/_authenticated/_onboarded/expenses/monthly-expenses"!
      </main>
    </>
  );
}
