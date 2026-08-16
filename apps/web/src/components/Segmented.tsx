/**
 * A radio group styled as a segmented control.
 *
 * Shared by signup and Settings so the same question cannot look like two
 * different questions. Nothing is preselected: an empty value means the person
 * has not answered, which is a state the outreach draft handles explicitly by
 * writing around gendered forms. Preselecting an option would silently turn
 * "not answered" into an answer.
 */

import type { Gender, GrammaticalForm } from '@leaseops/db';

export type { Gender, GrammaticalForm };

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const FORM_OPTIONS: { value: GrammaticalForm; label: string }[] = [
  { value: 'masculine', label: 'Masculine' },
  { value: 'feminine', label: 'Feminine' },
  { value: 'neutral', label: 'Avoid gendered wording' },
];

/** Each view keeps its own accent so the control reads as native to its screen. */
const ACCENT = {
  emerald: 'bg-emerald-500/15 border-emerald-500/60 text-emerald-300',
  blue: 'bg-blue-500/15 border-blue-500/60 text-blue-300',
} as const;

interface SegmentedProps<T extends string> {
  name: string;
  value: T | '';
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  accent?: keyof typeof ACCENT;
}

export default function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
  accent = 'emerald',
}: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`flex-1 px-3 py-2.5 text-xs font-semibold rounded-xl border transition-all min-h-[44px] ${
              selected
                ? ACCENT[accent]
                : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:border-zinc-700'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
