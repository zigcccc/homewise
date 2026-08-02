import { zodResolver } from '@hookform/resolvers/zod';
import { useRef } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z, { type ZodType } from 'zod';

import { Button, Form, FormControl, FormField, FormItem, Input, Textarea } from '@homewise/ui/core';

import { isServerStatus, serverMessage } from '../helpers';

/**
 * Edits one value in place: commits on blur and Enter, abandons on Escape.
 *
 * **Mount it only while editing.** Its `defaultValues` reseed on every mount, which is what lets the
 * caller reopen the editor on fresh data with no reset effect — the same remount boundary a dialog
 * form relies on.
 *
 * The three guards below look fussy and are all load-bearing; each one is a bug that has to be lived
 * through to be believed:
 *
 * - `closing` — Escape and a successful save both unmount this, and the browser fires `blur` on the
 *   way out. Without the flag that blur re-submits the value just abandoned, or re-sends one already
 *   written.
 * - `refused` — a rejected value deliberately leaves the editor open so the typing isn't lost, so
 *   the next blur would re-fire the same doomed request, and the one after that, with no way to
 *   click out of the field at all. Editing the value clears the match, so a correction gets its
 *   own attempt.
 * - the unchanged short-circuit — clicking in and straight back out must not cost a request. It runs
 *   *before* validation, because an editor opened on an empty value (a brand-new entry) can't reach
 *   anything behind a `min(1)` schema, and flagging a field nobody typed into as invalid is wrong.
 */
export function InlineTextField({
  ariaLabel,
  cancellable = false,
  className,
  defaultValue,
  multiline = false,
  onDone,
  onSave,
  placeholder,
  schema,
}: {
  ariaLabel: string;
  /**
   * Show an explicit Cancel button. Escape always works; this is for the fields where nothing on
   * screen says so — chiefly a new entry, where "get me out of here" is the common intent.
   */
  cancellable?: boolean;
  className?: string;
  defaultValue: string;
  /** A `Textarea` instead of an `Input`. Enter still commits; Shift+Enter inserts a newline. */
  multiline?: boolean;
  /** Close the editor. The caller owns the open/closed flag. */
  onDone: () => void;
  /** Throw to keep the editor open carrying what was typed. */
  onSave: (value: string) => Promise<unknown>;
  placeholder?: string;
  /**
   * The single field's schema, lifted from the server model (`createIngredientModel.shape.name`),
   * so an inline edit validates against the same contract the endpoint does.
   */
  schema: ZodType<string, string>;
}) {
  const closing = useRef(false);
  const refused = useRef<string | null>(null);

  const form = useForm<{ value: string }>({
    resolver: zodResolver(z.object({ value: schema })),
    defaultValues: { value: defaultValue },
  });

  const close = () => {
    closing.current = true;
    onDone();
  };

  const submit: SubmitHandler<{ value: string }> = async ({ value }) => {
    try {
      await onSave(value);
      close();
    } catch (error) {
      refused.current = value;

      const message = serverMessage(error, 'Something went wrong.');

      // A 409 is *about the value*, so it also earns the red `aria-invalid` border. A 500 or a
      // dropped connection says nothing about what was typed.
      if (isServerStatus(error, 409)) {
        form.setError('value', { message });
      }

      toast.error(message);
    }
  };

  const commit = () => {
    if (closing.current || form.formState.isSubmitting) {
      return;
    }

    // Ahead of `handleSubmit`, which never reaches `submit` when the value fails the schema — and an
    // untouched new entry is `''`, which every `min(1)` rejects.
    const value = form.getValues('value');

    if (value === defaultValue || value === refused.current) {
      close();
      return;
    }

    // The `onInvalid` half matters as much as the handler: `handleSubmit` silently declines to call
    // `submit` when the schema rejects the value, so without this a too-long name left a red border
    // and no explanation of what was wrong with it. A toast, not a `FormMessage` — this renders in
    // table cells and card rows that have no space to grow one.
    void form.handleSubmit(submit, (errors) => {
      toast.error(errors.value?.message ?? 'That value is not valid.');
    })();
  };

  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
      event.preventDefault();
      commit();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  // `contents` on a single-line form lets the caller's flex context reach the input directly, so its
  // column sizing keeps working. A Cancel button needs a real row of its own instead.
  let formClassName: string | undefined;

  if (cancellable) {
    formClassName = 'flex items-center gap-1';
  } else if (!multiline) {
    formClassName = 'contents';
  }

  return (
    <Form {...form}>
      {/* Through `commit`, not `handleSubmit` directly, so every path — blur, Enter, a native submit
          — passes the same short-circuit. */}
      <form
        className={formClassName}
        onSubmit={(event) => {
          event.preventDefault();
          commit();
        }}
      >
        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem className={cancellable ? 'min-w-0 flex-1' : undefined}>
              <FormControl>
                {multiline ? (
                  <Textarea
                    {...field}
                    aria-label={ariaLabel}
                    autoFocus
                    className={className}
                    onBlur={commit}
                    onKeyDown={keyDown}
                    placeholder={placeholder}
                    rows={2}
                  />
                ) : (
                  <Input
                    {...field}
                    aria-label={ariaLabel}
                    autoFocus
                    className={className}
                    onBlur={commit}
                    onKeyDown={keyDown}
                    placeholder={placeholder}
                    // An `<input>` reports a 20-character default as its max-content contribution to
                    // an auto-layout table regardless of `width`; this drops that to nothing so a
                    // caller's own sizing wins.
                    size={1}
                  />
                )}
              </FormControl>
            </FormItem>
          )}
        />
        {cancellable && (
          <Button
            // A click fires `mousedown → blur → click`, so without this the input blurs and `commit`
            // runs before Cancel is ever heard. Suppressing the default keeps focus in the field, so
            // the click is the only thing that happens.
            onClick={close}
            onMouseDown={(event) => event.preventDefault()}
            size="sm"
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
        )}
      </form>
    </Form>
  );
}
