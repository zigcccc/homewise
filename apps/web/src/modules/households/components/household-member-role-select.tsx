import { type HouseholdMemberRole, householdMemberRole, invitableRole } from '@homewise/server/households';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@homewise/ui/core';

const ROLE_LABELS = {
  [householdMemberRole.enum.adult]: 'Adult',
  [householdMemberRole.enum.child]: 'Child',
  [householdMemberRole.enum.pet]: 'Pet',
  [householdMemberRole.enum.external]: 'External',
} satisfies Record<HouseholdMemberRole, string>;

/**
 * The household member role options, rendered inside a `SelectContent` — use directly when you need a
 * custom trigger (e.g. wrapped in a tooltip), otherwise prefer `HouseholdMemberRoleSelect`.
 *
 * `invitableOnly` drops Pet: an invite ends in a real account, and a pet never holds one. The plain
 * form keeps it, because a managed pet member is a perfectly good row.
 */
export function HouseholdMemberRoleSelectItems({ invitableOnly = false }: { invitableOnly?: boolean }) {
  const options: readonly HouseholdMemberRole[] = invitableOnly ? invitableRole.options : householdMemberRole.options;

  return (
    <SelectGroup>
      <SelectLabel>Household member role</SelectLabel>
      {options.map((option) => (
        <SelectItem key={option} value={option}>
          {ROLE_LABELS[option]}
        </SelectItem>
      ))}
    </SelectGroup>
  );
}

type HouseholdMemberRoleSelectProps = {
  invitableOnly?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  triggerClassName?: string;
  placeholder?: string;
};

/** Controlled select for picking a household member role. */
export function HouseholdMemberRoleSelect({
  invitableOnly,
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
        <HouseholdMemberRoleSelectItems invitableOnly={invitableOnly} />
      </SelectContent>
    </Select>
  );
}
