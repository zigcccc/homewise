import { householdMemberRole } from '@homewise/server/households';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@homewise/ui/core';

/**
 * The household member role options (Adult / Child / Pet / External).
 * Rendered inside a `SelectContent` — use directly when you need a custom trigger
 * (e.g. wrapped in a tooltip), otherwise prefer `HouseholdMemberRoleSelect`.
 */
export function HouseholdMemberRoleSelectItems() {
  return (
    <SelectGroup>
      <SelectLabel>Household member role</SelectLabel>
      <SelectItem value={householdMemberRole.enum.adult}>Adult</SelectItem>
      <SelectItem value={householdMemberRole.enum.child}>Child</SelectItem>
      <SelectItem value={householdMemberRole.enum.pet}>Pet</SelectItem>
      <SelectItem value={householdMemberRole.enum.external}>External</SelectItem>
    </SelectGroup>
  );
}

type HouseholdMemberRoleSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  triggerClassName?: string;
  placeholder?: string;
};

/** Controlled select for picking a household member role. */
export function HouseholdMemberRoleSelect({
  value,
  onValueChange,
  name,
  disabled,
  triggerClassName,
  placeholder = 'Select a role',
}: HouseholdMemberRoleSelectProps) {
  return (
    <Select disabled={disabled} name={name} onValueChange={onValueChange} value={value}>
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <HouseholdMemberRoleSelectItems />
      </SelectContent>
    </Select>
  );
}
