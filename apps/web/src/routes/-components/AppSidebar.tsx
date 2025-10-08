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
import { Link } from '@tanstack/react-router';
import {
  CogIcon,
  CookingPotIcon,
  LayoutDashboardIcon,
  ListTodoIcon,
  MapPinIcon,
  PackageOpenIcon,
  PiggyBankIcon,
  ScrollTextIcon,
  UsersIcon,
} from 'lucide-react';

export function AppSidebar() {
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
      <SidebarFooter />
    </Sidebar>
  );
}
