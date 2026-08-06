import { format, isValid, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { type ComponentProps, useState } from 'react';

import { Button, Calendar, Input, Popover, PopoverContent, PopoverTrigger } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { DATE_DISPLAY_FORMAT, parseDayFirst } from '../helpers';

/**
 * ShadCN date-picker (input + calendar popover) bound to the `YYYY-MM-DD` string the API expects.
 * Typing is allowed for fast entry; the calendar covers the "which day was that?" case.
 *
 * Past-only by default, because most dates here are records of something that happened (a birth
 * date, a first-heard date, a joined-the-family date). `allowFuture` opts out, for the ranges that
 * are inherently ahead — which stretch of the meal plan to shop for.
 */
export function DateField({
  allowFuture = false,
  ariaLabel,
  inline = false,
  onChange,
  required = false,
  value,
  ...inputProps
}: {
  allowFuture?: boolean;
  /**
   * A name for the input where no `<label>` points at it — the table cells, which have a column
   * header and nothing else. Inside a form, use `FormLabel` and leave this alone.
   */
  ariaLabel?: string;
  /**
   * Table treatment: reads as plain text until hovered or focused, so a column of dates doesn't
   * become a column of form controls. Same bargain the inline selects make.
   */
  inline?: boolean;
  onChange: (value: string) => void;
  /**
   * The date can't be cleared. Emptying the field puts the last value back instead of reporting `''`
   * — which is what a column that requires a date would refuse anyway.
   *
   * For a field inside a form this is usually wrong: clearing it there should surface the schema's
   * own message. It's for the editors that commit straight to the server and have nowhere to put one.
   */
  required?: boolean;
  value: string;
  /**
   * Everything else lands on the `Input`, and `FormControl` is why that matters: it clones its child
   * with the `id` its `FormLabel` points at, plus `aria-describedby` and `aria-invalid`. Declaring
   * an `id` prop of our own instead made the child's value win the Radix `Slot` merge and override
   * the generated one — so every in-form call site had to re-point its label by hand, and the one
   * that forgot shipped a `<label>` attached to nothing.
   */
} & Omit<ComponentProps<typeof Input>, 'onChange' | 'value'>) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const isValidSelection = selected && isValid(selected);

  // Local text so a half-typed date doesn't clobber the form value on every keystroke.
  const [text, setText] = useState(isValidSelection ? format(selected, DATE_DISPLAY_FORMAT) : '');

  const restoreText = () => setText(isValidSelection ? format(selected, DATE_DISPLAY_FORMAT) : '');

  const commitText = (input: string) => {
    if (input.trim() === '') {
      // A required date has no cleared state, so an empty field is just another value this can't
      // take — put the last one back, exactly as unparseable text does below. Without this the
      // editors that commit straight to the server send `''` and get a failure toast for what is an
      // ordinary "select it all and retype" gesture.
      if (required) {
        restoreText();
        return;
      }

      onChange('');
      setText('');
      return;
    }

    const parsed = parseDayFirst(input, allowFuture);

    if (parsed) {
      onChange(format(parsed, 'yyyy-MM-dd'));
      setText(format(parsed, DATE_DISPLAY_FORMAT));
      return;
    }

    // Unparseable: restore the last good value rather than silently keeping bad text.
    restoreText();
  };

  return (
    <div
      className={cn(
        'relative flex gap-2',
        // The calendar arrives with the box, on hover and while focused — the same fade the inline
        // selects give their chevron.
        inline && '[&_svg]:opacity-0 focus-within:[&_svg]:opacity-60 hover:[&_svg]:opacity-60',
        // Held open while the calendar is, or the field drops back to looking like plain text the
        // moment the pointer moves off it and onto the popover it just opened.
        inline && open && '[&_svg]:opacity-60'
      )}
    >
      <Input
        aria-label={ariaLabel}
        className={cn(
          'pr-10',
          inline && 'border-transparent shadow-none hover:bg-accent focus-visible:border-input',
          inline && open && 'border-input bg-accent'
        )}
        onBlur={(evt) => commitText(evt.target.value)}
        onChange={(evt) => setText(evt.target.value)}
        onKeyDown={(evt) => {
          if (evt.key === 'Enter') {
            evt.preventDefault();
            commitText(evt.currentTarget.value);
          }
        }}
        placeholder="dd. mm. yyyy"
        // An `<input>` reports its default 20-character width as its max-content contribution no
        // matter what `w-full` says, which in an auto-layout table hands this column far more room
        // than a date needs and squeezes every other one. `InlineTextField` does the same.
        size={1}
        value={text}
        {...inputProps}
      />
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <Button className="absolute top-1/2 right-1 size-7 -translate-y-1/2" type="button" variant="ghost">
            <CalendarIcon className="size-3.5" />
            <span className="sr-only">Pick a date</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto overflow-hidden p-0">
          <Calendar
            captionLayout="dropdown"
            disabled={allowFuture ? undefined : { after: new Date() }}
            mode="single"
            onSelect={(date) => {
              if (date) {
                onChange(format(date, 'yyyy-MM-dd'));
                setText(format(date, DATE_DISPLAY_FORMAT));
              }
              setOpen(false);
            }}
            selected={isValidSelection ? selected : undefined}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
