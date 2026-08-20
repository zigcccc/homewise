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
import { LayoutDashboardIcon, LogOutIcon, type LucideIcon, UserIcon } from 'lucide-react';
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
import { canRole, NAV_GROUPS, useHouseholdRole } from '@/modules/shared';

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
  const role = useHouseholdRole();
  const isExternal = household?.viewer.role === 'external';

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
            <NavItem fuzzy={false} icon={LayoutDashboardIcon} label="Dashboard" to={isExternal ? '/guest' : '/'} />
          </SidebarMenu>
        </SidebarGroup>
        {/* Rendered from the same map the route guard reads, so a link can never appear for a section
            the guard would bounce, and a group with nothing left in it disappears rather than showing
            an empty heading. */}
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((section) => canRole(role, section.area, section.access ?? 'read'));

          if (items.length === 0) {
            return null;
          }

          return (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>
                {group.label === 'Manage' && household ? `Manage "${household.name}"` : group.label}
              </SidebarGroupLabel>
              <SidebarMenu>
                {items.map((section) => (
                  <NavItem
                    icon={section.icon}
                    key={section.label}
                    label={section.label}
                    to={section.to}
                    tooltip={section.tooltip}
                  />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          );
        })}
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
                    {/* `min-w-0` is what lets the truncation happen: a flex child's default
                        `min-width: auto` refuses to shrink below its content. */}
                    <div className="flex min-w-0 flex-col items-start gap-0.5 leading-none">
                      <span className="w-full truncate font-medium">{user.name}</span>
                      <span className="w-full truncate text-muted-foreground text-xs">{user.email}</span>
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
