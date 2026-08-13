import { cn } from '@homewise/ui/lib';

import { type ActivityEntry } from '../activity.queries';
import { collapseChanges, fieldLabel, readValue } from '../helpers';

/**
 * What a save changed: "Birthday: 03. 07. 2019 → 04. 07. 2019". Renders nothing when there is
 * nothing to say, so a caller can hand it any entry.
 *
 * Emphasis is weight, never colour — this renders on the page *and* inside an inverted tooltip.
 */
export function ActivityChanges({ changes, className }: { changes: ActivityEntry['changes']; className?: string }) {
  const collapsed = collapseChanges(changes);

  if (collapsed.length === 0) {
    return null;
  }

  return (
    <ul className={cn('flex flex-wrap gap-x-3 gap-y-0.5 text-xs', className)} data-testid="activity-changes">
      {collapsed.map((change) => {
        const from = readValue(change.from);
        const to = readValue(change.to);

        // A photo, an identity number, a list of ingredients: named, and left at that.
        if (from === undefined || to === undefined) {
          return (
            <li className="max-w-full truncate font-medium" key={change.field}>
              {fieldLabel(change.field)}
            </li>
          );
        }

        return (
          <li className="max-w-full truncate" key={change.field}>
            {fieldLabel(change.field)}: {from} → <span className="font-medium">{to}</span>
          </li>
        );
      })}
    </ul>
  );
}
