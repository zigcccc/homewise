import { useState } from 'react';

import { cn } from '@homewise/ui/lib';

import { InlineTextField } from './inline-text-field';

/**
 * The resting and editing halves have to be the same box down to the border, or clicking in nudges
 * the text and resizes the column. `Input` supplies `h-9`, `w-full` and a 1px border; the button
 * matches it with a transparent one, and `flex items-center` centres its text the way the input's
 * own line box does.
 */
const boxClassName = 'h-9 w-full rounded-md border px-2 text-sm';

const restingClassName = `${boxClassName} col-start-1 row-start-1 flex items-center border-transparent text-left hover:bg-accent`;

/**
 * A hidden copy of the value, sharing the controls' horizontal box, that holds the column open.
 *
 * An `<input>` reports its default 20-character width as its max-content contribution to an
 * auto-layout table no matter what `w-full` says — `InlineTextField` passes `size={1}` to drop that
 * to nothing, and this puts the value's own width back. Without it the column would jump every time
 * an editor opened or closed.
 */
const sizerClassName = 'invisible col-start-1 row-start-1 border px-2 text-sm';

/**
 * Click-to-edit text in a table cell: reads as ordinary table text until you reach for it.
 *
 * The sizer and the control share one grid cell, and the control has to be **placed** into it.
 * `InlineTextField` puts the class it's given on the input and its form is `display: contents`, so
 * the grid item is a `FormItem` carrying no position of its own — auto-placement steps over the
 * sizer's row and opens a second one, which is a band of empty space above the editor and a row that
 * grows the moment you click. Hence the wrapper below rather than a class on the field.
 */
export function InlineCell({
  ariaLabel,
  display,
  displayClassName,
  fill = false,
  maxWidthClassName,
  onSave,
  schema,
  value,
}: {
  ariaLabel: string;
  display: string;
  /** Styling for the resting value only — never for the editor, which has to stay legible. */
  displayClassName?: string;
  /** Grow with the column instead of stopping at `maxWidthClassName`. */
  fill?: boolean;
  /**
   * Where the control stops growing. A short value — an amount, a date, a category — would otherwise
   * be mostly empty box in a wide column, so the cell holds the slack instead.
   */
  maxWidthClassName?: string;
  onSave: (next: string) => Promise<unknown>;
  schema: Parameters<typeof InlineTextField>[0]['schema'];
  value: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    // `min-w-0 flex-1` for the cells that sit in a flex row beside something else (the expense title
    // and its paid-back badge): without them this shrinks to max-content and the editor opens as a
    // box hugging the text. Both are inert everywhere else.
    <div className={cn('grid min-w-0 flex-1 grid-cols-1', !fill && maxWidthClassName)}>
      <span className={sizerClassName}>{display}</span>
      {editing ? (
        <div className="col-start-1 row-start-1">
          {/* Mounted only while editing, so `defaultValues` reseed on every open with no reset effect. */}
          <InlineTextField
            ariaLabel={ariaLabel}
            className={boxClassName}
            defaultValue={value}
            onDone={() => setEditing(false)}
            onSave={onSave}
            schema={schema}
          />
        </div>
      ) : (
        // Labelled rather than named by its content: an amount cell's text is a formatted currency
        // string, which is no way to find a control.
        <button
          aria-label={`Edit ${ariaLabel.toLowerCase()}`}
          className={cn(restingClassName, displayClassName)}
          onClick={() => setEditing(true)}
          type="button"
        >
          {display}
        </button>
      )}
    </div>
  );
}

/**
 * The same grid-over-sizer arrangement for a control this doesn't own — the date cell, whose
 * `DateField` is always mounted rather than swapping between two states.
 *
 * `sizerClassName` is overridable because the box has to match the control being covered:
 * `DateField`'s `Input` is `pl-3` with a `pr-10` gutter for the calendar button, and measuring it as
 * `px-2` puts that button on top of the date.
 */
export function InlineCellSizer({
  children,
  className,
  display,
  sizerClassName: sizer = sizerClassName,
}: {
  children: React.ReactNode;
  className?: string;
  display: string;
  sizerClassName?: string;
}) {
  return (
    <div className={cn('grid grid-cols-1', className)}>
      <span className={sizer}>{display}</span>
      <div className="col-start-1 row-start-1">{children}</div>
    </div>
  );
}
