import { cn } from '@homewise/ui/lib';

import { type ActivityEntry } from '../activity.queries';
import { collapseChanges, fieldLabel, readValue } from '../helpers';

/**
 * What a save actually changed, under the sentence that says who saved it: "Birthday 03. 07. 2019 →
 * 04. 07. 2019". Without it a line can only report that something happened, which is the question
 * rather than the answer.
 *
 * Emphasis is weight, never colour: this renders both on the page and inside a tooltip, which
 * inverts the background under it. The caller sets the colour, the component sets the hierarchy.
 *
 * Renders nothing when there is nothing to say — a create, a delete, or an entity whose save takes
 * no diff — so a caller can hand it any entry.
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

        // A field with no values worth showing is its own content — a photo, an identity number, a
        // list of ingredients. Named, and left at that.
        if (from === undefined || to === undefined) {
          return (
            <li className="font-medium" key={change.field}>
              {fieldLabel(change.field)}
            </li>
          );
        }

        return (
          <li key={change.field}>
            {fieldLabel(change.field)}: {from} → <span className="font-medium">{to}</span>
          </li>
        );
      })}
    </ul>
  );
}
