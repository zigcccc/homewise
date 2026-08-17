import { setTag, setUser } from '@sentry/react';
import { useQuery } from '@tanstack/react-query';
import {
  Link,
  type LinkProps,
  useMatchRoute,
  useNavigate,
  useRouteContext,
  useRouterState,
} from '@tanstack/react-router';
import {
  BabyIcon,
  BookUserIcon,
  CarrotIcon,
  CogIcon,
  CookingPotIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  LogOutIcon,
  type LucideIcon,
  MapPinIcon,
  PackageOpenIcon,
  PawPrintIcon,
  PiggyBankIcon,
  ScrollTextIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@homewise/ui/core';

import { authClient } from '@/auth/client';
import { getSessionQueryOptions } from '@/auth/queries';
import { getMyHouseholdQueryOptions } from '@/modules/households';

function SidebarAutocloseOnMobile() {
  const { setOpenMobile } = useSidebar();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);

  return null;
}

/**
 * One sidebar entry, as an anchor and nothing else — `asChild` is what keeps `SidebarMenuButton`
 * from rendering its own `<button>` inside the link.
 *
 * `fuzzy` matching mirrors what `<Link>` computes for itself, so a detail route keeps its section
 * lit. `/` is the exception: fuzzily, every route is under it.
 */
function NavItem({
  fuzzy = true,
  icon: Icon,
  label,
  to,
  tooltip,
}: {
  fuzzy?: boolean;
  icon: LucideIcon;
  label: string;
  to: LinkProps['to'];
  tooltip?: string;
}) {
  const matchRoute = useMatchRoute();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={Boolean(matchRoute({ fuzzy, to }))} tooltip={tooltip ?? label}>
        <Link to={to}>
          <Icon className="size-4" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { queryClient } = useRouteContext({ strict: false });
  const navigate = useNavigate();
  const { data: auth } = useQuery(getSessionQueryOptions());
  const { data: household } = useQuery(getMyHouseholdQueryOptions());

  const { user } = auth?.data ?? {};

  const handleSignOut = async () => {
    await authClient.signOut();
    queryClient?.clear();
    // Same reason the query cache is cleared: whoever signs in next on this tab must not inherit the
    // previous person's identity on their reports.
    setUser(null);
    setTag('householdId', undefined);
    navigate({ to: '/login', search: { redirect: window.location.href } });
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarAutocloseOnMobile />
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Homewise">
              <Link to="/">
                <span className="font-bold text-lg">Homewise</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <NavItem fuzzy={false} icon={LayoutDashboardIcon} label="Dashboard" to="/" />
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Family &amp; friends</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem icon={BabyIcon} label="Kids" to="/family/kids" />
            <NavItem icon={PawPrintIcon} label="Pets" to="/family/pets" />
            <NavItem icon={BookUserIcon} label="Contacts" to="/family/contacts" />
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Expenses</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem icon={PiggyBankIcon} label="Monthly expenses" to="/expenses/monthly-expenses" />
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Storage</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem icon={MapPinIcon} label="Locations" to="/storage/locations" tooltip="Storage locations" />
            <NavItem icon={PackageOpenIcon} label="Items" to="/storage/items" />
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Food & Groceries</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem icon={ListTodoIcon} label="Shopping lists" to="/food/shopping-lists" />
            <NavItem icon={CookingPotIcon} label="Weekly meal plans" to="/food/meal-plan" tooltip="Meal plans" />
            <NavItem icon={ScrollTextIcon} label="Recipes" to="/food/recipes" />
            <NavItem icon={CarrotIcon} label="Ingredients" to="/food/ingredients" />
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{household ? `Manage "${household.name}"` : 'Manage'}</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem icon={UsersIcon} label="Household members" to="/manage/household-members" />
            <NavItem icon={HistoryIcon} label="Activity" to="/manage/activity" />
            <NavItem icon={CogIcon} label="Settings" to="/manage/settings" />
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      {user && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    className="w-full justify-start hover:cursor-pointer data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                    size="lg"
                  >
                    <Avatar className="mr-2">
                      <AvatarImage alt={user.name} src={user.image || undefined} />
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start gap-0.5 leading-none">
                      <span className="font-medium">{user.name}</span>
                      <span className="text-muted-foreground text-xs">{user.email}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)" side="top">
                  <DropdownMenuItem asChild>
                    <Link to="/user-profile">
                      <UserIcon className="mr-2 h-4 w-4" />
                      <span>Your profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSignOut}>
                    <LogOutIcon className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
