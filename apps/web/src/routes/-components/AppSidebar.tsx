import { Avatar, AvatarFallback, AvatarImage } from '@homewise/ui/core/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@homewise/ui/core/dropdown-menu';
import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarFooter,
  SidebarMenuButton,
} from '@homewise/ui/core/sidebar';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import {
  CogIcon,
  CookingPotIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  LogOutIcon,
  MapPinIcon,
  PackageOpenIcon,
  PiggyBankIcon,
  ScrollTextIcon,
  UsersIcon,
} from 'lucide-react';

import { authClient } from '@/auth/client';

export function AppSidebar() {
  const { queryClient } = useRouteContext({ strict: false });
  const navigate = useNavigate();
  const { data: auth } = authClient.useSession();

  const handleSignOut = async () => {
    await authClient.signOut();
    queryClient?.clear();
    navigate({ to: '/login', search: { redirect: window.location.href } });
  };

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Homewise">
              <Link to="/">
                <span className="text-lg font-bold">Homewise</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link to="/">
                {({ isActive }) => (
                  <SidebarMenuButton isActive={isActive} tooltip="Dashboard">
                    <LayoutDashboardIcon className="size-4" />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                )}
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Expenses</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link to="/">
                <SidebarMenuButton tooltip="Monthly expenses">
                  <PiggyBankIcon className="size-4" />
                  <span>Monthly expenses</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Storage</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link to="/">
                <SidebarMenuButton tooltip="Storage overview">
                  <PackageOpenIcon className="size-4" />
                  <span>Overview</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Link to="/">
                <SidebarMenuButton tooltip="Storage overview">
                  <MapPinIcon className="size-4" />
                  <span>Locations</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Food & Groceries</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link to="/">
                <SidebarMenuButton tooltip="Shopping lists">
                  <ListTodoIcon className="size-4" />
                  <span>Shopping lists</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Link to="/">
                <SidebarMenuButton tooltip="Meal plans">
                  <CookingPotIcon className="size-4" />
                  <span>Meal plans</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Link to="/">
                <SidebarMenuButton tooltip="Recipes">
                  <ScrollTextIcon className="size-4" />
                  <span>Recipes</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <Link to="/">
                <SidebarMenuButton tooltip="Household members">
                  <UsersIcon className="size-4" />
                  <span>Household members</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <Link to="/">
                <SidebarMenuButton tooltip="Settings">
                  <CogIcon className="size-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      {auth?.user && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground w-full justify-start hover:cursor-pointer"
                    size="lg"
                  >
                    <Avatar className="mr-2">
                      <AvatarImage alt={auth.user.name} src={auth.user.image ?? undefined} />
                      <AvatarFallback>{auth.user.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start gap-0.5 leading-none">
                      <span className="font-medium">{auth.user.name}</span>
                      <span className="text-muted-foreground text-xs">{auth.user.email}</span>
                    </div>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width)" side="top">
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
