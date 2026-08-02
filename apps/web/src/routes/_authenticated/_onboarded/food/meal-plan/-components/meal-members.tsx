import { useState } from 'react';

import { Badge, Checkbox, Label, Popover, PopoverContent, PopoverTrigger } from '@homewise/ui/core';

import { type MemberOption, type PlannedMeal } from '@/modules/meal-plan';

/**
 * Who's eating a meal, edited from the chips themselves.
 *
 * Everyone opens ticked, because an unassigned meal *is* for everyone — you untick the exceptions.
 * On the way out that's normalised back to the empty set rather than stored as every id: the empty
 * set is what the "Everyone" badge reads, and it means a member who joins the household next month
 * is automatically included in meals planned for everyone. Pinning today's ids would silently
 * exclude them.
 *
 * No react-hook-form here on purpose. There's no submit and no field to hang a message on — this is
 * the same shape as the inline `Select`s in the ingredient table, where the control is live and the
 * failure path is a toast.
 */
export function MealMembers({
  disabled,
  meal,
  members,
  onSave,
}: {
  disabled?: boolean;
  meal: PlannedMeal;
  members: MemberOption[];
  onSave: (memberIds: number[]) => void;
}) {
  const assigned = meal.members.map((member) => member.id);
  const everyone = assigned.length === 0;

  // The working set while the popover is open, so unticking two people costs one request rather
  // than two. Seeded on open, which is why it can't just be derived.
  const [draft, setDraft] = useState<number[] | null>(null);
  const ticked = draft ?? (everyone ? members.map((member) => member.id) : assigned);

  const close = () => {
    if (draft) {
      const next = draft.length === members.length ? [] : draft;
      const changed = next.length !== assigned.length || next.some((id) => !assigned.includes(id));

      if (changed) {
        onSave(next);
      }
    }

    setDraft(null);
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setDraft(ticked);
        } else {
          close();
        }
      }}
    >
      <PopoverTrigger
        aria-label={`Who's eating ${meal.label}`}
        className="flex flex-wrap items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent disabled:opacity-50"
        disabled={disabled}
      >
        {meal.members.length === 0 ? (
          <Badge variant="muted">Everyone</Badge>
        ) : (
          meal.members.map((member) => (
            <Badge key={member.id} variant="secondary">
              {member.displayName}
            </Badge>
          ))
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 space-y-2">
        <p className="font-medium text-sm">Who's eating this?</p>
        <div className="space-y-2">
          {members.map((member) => {
            // `htmlFor`, not a wrapping label: Radix renders the checkbox as a button, which a label
            // can't implicitly associate with.
            const inputId = `meal-${meal.id}-member-${member.id}`;

            return (
              <div className="flex items-center gap-2" key={member.id}>
                <Checkbox
                  checked={ticked.includes(member.id)}
                  id={inputId}
                  onCheckedChange={(next) =>
                    setDraft(next ? [...ticked, member.id] : ticked.filter((memberId) => memberId !== member.id))
                  }
                />
                <Label className="cursor-pointer font-normal" htmlFor={inputId}>
                  {member.displayName}
                </Label>
              </div>
            );
          })}
        </div>
        <p className="text-muted-foreground text-xs">Untick anyone who's eating something else.</p>
      </PopoverContent>
    </Popover>
  );
}
