import { format, isFuture, isValid, parse, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';

import { Button, Calendar, Input, Popover, PopoverContent, PopoverTrigger } from '@homewise/ui/core';
import { cn } from '@homewise/ui/lib';

import { DATE_DISPLAY_FORMAT } from '../helpers';

/**
 * Accepted typing formats, tried in order — the display format first, so what the field renders is
 * always something it takes back. Day-first throughout: `new Date()` would read "03. 07. 2026" as
 * 7 March (US month-first), which is the wrong reading here.
 */
const DATE_INPUT_FORMATS = [
  DATE_DISPLAY_FORMAT,
  'd. M. yyyy',
  'dd.MM.yyyy',
  'd.M.yyyy',
  'dd/MM/yyyy',
  'd/M/yyyy',
  'dd-MM-yyyy',
  'd-M-yyyy',
  'yyyy-MM-dd',
  'd MMMM yyyy',
  'd MMM yyyy',
];

/**
 * Parses day-first input. Returns undefined for anything unparseable or out of range (31. 02.), and
 * — unless `allowFuture` — for anything ahead of today, matching the calendar's `after` limit.
 */
function parseDayFirst(input: string, allowFuture: boolean) {
  const trimmed = input.trim();

  for (const dateFormat of DATE_INPUT_FORMATS) {
    const parsed = parse(trimmed, dateFormat, new Date());

    if (isValid(parsed) && (allowFuture || !isFuture(parsed))) {
      return parsed;
    }
  }

  return undefined;
}

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
  id,
  inline = false,
  onChange,
  value,
}: {
  allowFuture?: boolean;
  id: string;
  /**
   * Table treatment: reads as plain text until hovered or focused, so a column of dates doesn't
   * become a column of form controls. Same bargain the inline selects make.
   */
  inline?: boolean;
  onChange: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseISO(value) : undefined;
  const isValidSelection = selected && isValid(selected);

  // Local text so a half-typed date doesn't clobber the form value on every keystroke.
  const [text, setText] = useState(isValidSelection ? format(selected, DATE_DISPLAY_FORMAT) : '');

  const commitText = (input: string) => {
    if (input.trim() === '') {
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
    setText(isValidSelection ? format(selected, DATE_DISPLAY_FORMAT) : '');
  };

  return (
    <div
      className={cn(
        'relative flex gap-2',
        // The calendar arrives with the box, on hover and while focused — the same fade the inline
        // selects give their chevron.
        inline && '[&_svg]:opacity-0 focus-within:[&_svg]:opacity-60 hover:[&_svg]:opacity-60'
      )}
    >
      <Input
        className={cn('pr-10', inline && 'border-transparent shadow-none hover:bg-accent focus-visible:border-input')}
        id={id}
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
