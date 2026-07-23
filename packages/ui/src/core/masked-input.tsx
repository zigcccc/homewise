import { CopyIcon, EyeOffIcon, PencilIcon } from 'lucide-react';
import { type ComponentProps } from 'react';

import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group';

/** Masks all but the last 4 characters with `•` (a short value becomes all dots). */
function mask(value: string) {
  if (value.length <= 4) {
    return '•'.repeat(value.length);
  }

  return '•'.repeat(value.length - 4) + value.slice(-4);
}

type MaskedInputProps = Omit<ComponentProps<typeof InputGroupInput>, 'onChange' | 'value'> & {
  value: string;
  onChange: (value: string) => void;
  /** Whether the real value is shown/editable. Controlled by the parent so it can re-mask after a save. */
  revealed: boolean;
  onReveal: () => void;
  /** Re-masks without saving — the crossed-eye action shown while revealed. */
  onHide: () => void;
  /** Fired after the value is copied to the clipboard — wire it to a toast for feedback. */
  onCopy?: () => void;
  /** Fired when the clipboard write fails (insecure context, denied permission) — wire it to a toast. */
  onCopyError?: () => void;
};

/**
 * A text input that gives the *impression* of a sensitive value. Read-only and masked by default
 * (last 4 characters shown), with Copy and Edit actions. Edit reveals a real editable input; copy
 * writes the unmasked value to the clipboard. Nothing is masked server-side — this is UI only.
 */
function MaskedInput({ value, onChange, revealed, onReveal, onHide, onCopy, onCopyError, ...props }: MaskedInputProps) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      onCopy?.();
    } catch {
      onCopyError?.();
    }
  };

  return (
    <InputGroup>
      {revealed ? (
        // Distinct key from the masked branch so switching remounts the input, letting autoFocus fire.
        <InputGroupInput
          autoFocus
          key="revealed"
          onChange={(event) => onChange(event.target.value)}
          value={value}
          {...props}
        />
      ) : (
        <InputGroupInput key="masked" readOnly value={mask(value)} {...props} />
      )}
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Copy" onClick={copy} size="icon-xs" type="button">
          <CopyIcon />
        </InputGroupButton>
        {revealed ? (
          <InputGroupButton aria-label="Hide" onClick={onHide} size="icon-xs" type="button">
            <EyeOffIcon />
          </InputGroupButton>
        ) : (
          <InputGroupButton aria-label="Edit" onClick={onReveal} size="icon-xs" type="button">
            <PencilIcon />
          </InputGroupButton>
        )}
      </InputGroupAddon>
    </InputGroup>
  );
}

export { MaskedInput };
