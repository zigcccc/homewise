import { type LinkProps } from '@tanstack/react-router';
import {
  BabyIcon,
  BookUserIcon,
  CarrotIcon,
  CogIcon,
  CookingPotIcon,
  HistoryIcon,
  ListTodoIcon,
  type LucideIcon,
  MapPinIcon,
  PackageOpenIcon,
  PawPrintIcon,
  PiggyBankIcon,
  ScrollTextIcon,
  UsersIcon,
} from 'lucide-react';

import { type PermissionAccess, type PermissionArea } from '@homewise/server/permissions';

export type NavEntry = {
  /** What the section is gated on. Defaults to `'read'`; `'write'` for a page that only edits. */
  access?: PermissionAccess;
  area: PermissionArea;
  icon: LucideIcon;
  label: string;
  to: LinkProps['to'];
  tooltip?: string;
};

/**
 * The app's sections, and the capability each one needs.
 *
 * The **single** place a path is tied to an area: the sidebar renders from it and `_onboarded`'s
 * `beforeLoad` guards from it, so a section can never appear in the nav without also being reachable,
 * or be reachable without appearing.
 *
 * `/user-profile` is deliberately absent — it edits the caller's own account rather than the
 * household, so every role keeps it.
 */
export const NAV_GROUPS: { items: NavEntry[]; label: string }[] = [
  {
    label: 'Family & friends',
    items: [
      { area: 'childProfiles', icon: BabyIcon, label: 'Kids', to: '/family/kids' },
      { area: 'petProfiles', icon: PawPrintIcon, label: 'Pets', to: '/family/pets' },
      { area: 'contacts', icon: BookUserIcon, label: 'Contacts', to: '/family/contacts' },
    ],
  },
  {
    label: 'Expenses',
    items: [{ area: 'expenses', icon: PiggyBankIcon, label: 'Monthly expenses', to: '/expenses/monthly-expenses' }],
  },
  {
    label: 'Storage',
    items: [
      {
        area: 'storageLocations',
        icon: MapPinIcon,
        label: 'Locations',
        to: '/storage/locations',
        tooltip: 'Storage locations',
      },
      { area: 'storageItems', icon: PackageOpenIcon, label: 'Items', to: '/storage/items' },
    ],
  },
  {
    label: 'Food & Groceries',
    items: [
      { area: 'shoppingLists', icon: ListTodoIcon, label: 'Shopping lists', to: '/food/shopping-lists' },
      {
        area: 'mealPlan',
        icon: CookingPotIcon,
        label: 'Weekly meal plans',
        to: '/food/meal-plan',
        tooltip: 'Meal plans',
      },
      { area: 'recipes', icon: ScrollTextIcon, label: 'Recipes', to: '/food/recipes' },
      { area: 'ingredients', icon: CarrotIcon, label: 'Ingredients', to: '/food/ingredients' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { area: 'householdMembers', icon: UsersIcon, label: 'Household members', to: '/manage/household-members' },
      { area: 'activity', icon: HistoryIcon, label: 'Activity', to: '/manage/activity' },
      // Gated on write, not read: the page is nothing but mutations — rename, currency, transfer,
      // delete — so there is nothing on it for someone who cannot change the household.
      { access: 'write', area: 'household', icon: CogIcon, label: 'Settings', to: '/manage/settings' },
    ],
  },
];

const NAV_ENTRIES = NAV_GROUPS.flatMap((group) => group.items);

/**
 * The section a path belongs to, or `undefined` for one that needs no capability (the two homes, the
 * user's own profile). Matched on a path boundary rather than a bare prefix, so a future
 * `/storage-something` could never be mistaken for `/storage`.
 */
export function areaForPath(pathname: string) {
  return NAV_ENTRIES.find((entry) => pathname === entry.to || pathname.startsWith(`${entry.to}/`));
}
