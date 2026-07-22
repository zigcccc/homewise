import { format, isFuture, isValid, parse, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { useState } from 'react';

import { Button, Calendar, Input, Popover, PopoverContent, PopoverTrigger } from '@homewise/ui/core';

/** Display format for the text input; matches the tables' `DD. MM. YYYY`. Value stays ISO. */
const DATE_DISPLAY_FORMAT = 'dd. MM. yyyy';

/**
 * Accepted typing formats, tried in order. Day-first throughout — `new Date()` would read
 * "03. 07. 2026" as 7 March (US month-first), which is the wrong reading here.
 */
const DATE_INPUT_FORMATS = [
  'dd. MM. yyyy',
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
 * Parses day-first input. Returns undefined for anything unparseable, out of range (31. 02.), or in
 * the future — these dates are past-only, matching the calendar's `disabled={{ after: today }}`.
 */
function parseDayFirst(input: string) {
  const trimmed = input.trim();

  for (const dateFormat of DATE_INPUT_FORMATS) {
    const parsed = parse(trimmed, dateFormat, new Date());

    if (isValid(parsed) && !isFuture(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

/**
 * ShadCN date-picker (input + calendar popover) bound to the `YYYY-MM-DD` string the API expects.
 * Typing is allowed for fast entry; the calendar covers the "which day was that?" case. The dates it
 * captures (a birth date, a first-heard date, a joined-the-family date) can only be in the past.
 */
export function DateField({ id, onChange, value }: { id: string; onChange: (value: string) => void; value: string }) {
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

    const parsed = parseDayFirst(input);

    if (parsed) {
      onChange(format(parsed, 'yyyy-MM-dd'));
      setText(format(parsed, DATE_DISPLAY_FORMAT));
      return;
    }

    // Unparseable: restore the last good value rather than silently keeping bad text.
    setText(isValidSelection ? format(selected, DATE_DISPLAY_FORMAT) : '');
  };

  return (
    <div className="relative flex gap-2">
      <Input
        className="pr-10"
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
            // These dates can only be in the past.
            disabled={{ after: new Date() }}
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
