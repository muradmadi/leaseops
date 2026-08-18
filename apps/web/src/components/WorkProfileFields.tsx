/**
 * Your own work — the only part of the tenant story that is not shared with the
 * household.
 *
 * Which questions appear follows the employment status, because "contract type
 * and length" is the wrong question for a student and "what you study" is the
 * wrong one for a retiree. Nothing is preselected: an unanswered status is a
 * real state, and picking one for the user would answer a question about them
 * that they have not been asked.
 */
import type { EmploymentStatus, WorkProfile } from '@leaseops/db';
import Segmented from './Segmented';
import { Briefcase, FileSignature, Wallet, Stamp } from 'lucide-react';

export type { EmploymentStatus, WorkProfile };

export const EMPLOYMENT_OPTIONS: { value: EmploymentStatus; label: string }[] = [
  { value: 'employed', label: 'Employed' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'student', label: 'Student' },
  { value: 'student_working', label: 'Student + working' },
  { value: 'retired', label: 'Retired' },
  { value: 'not_working', label: 'Not working' },
];

/** The blank form. A field the user has not typed into stays empty, never defaulted. */
export const EMPTY_WORK_PROFILE: Required<Omit<WorkProfile, 'employmentStatus'>> & {
  employmentStatus: EmploymentStatus | '';
} = {
  employmentStatus: '',
  occupation: '',
  contractDetails: '',
  income: '',
  rightToWork: '',
};

export type WorkDraft = typeof EMPTY_WORK_PROFILE;

type TextField = Exclude<keyof WorkDraft, 'employmentStatus'>;

interface FieldCopy {
  label: string;
  placeholder: string;
}

/**
 * Which questions each status is asked, and how they are worded.
 *
 * A status that omits a field is not asked it — and `pruneToStatus` then clears
 * anything left over from a previous answer, so a fact the user can no longer
 * see cannot travel to a landlord.
 */
const QUESTIONS: Record<EmploymentStatus, Partial<Record<TextField, FieldCopy>>> = {
  employed: {
    occupation: {
      label: 'Job title and employer',
      placeholder: 'e.g., MarTech Specialist at LeadTech, fully remote',
    },
    contractDetails: {
      label: 'Contract type and hours',
      placeholder: 'e.g., permanent contract, 30h/week, 3 years with them',
    },
    income: { label: 'Income', placeholder: 'e.g., 2.400 € net per month' },
    rightToWork: {
      label: 'Visa or residency status',
      placeholder: 'e.g., student visa being changed to a work visa — leave blank if not relevant',
    },
  },
  self_employed: {
    occupation: {
      label: 'What you do, and for how long',
      placeholder: 'e.g., freelance designer, 4 years, three regular clients',
    },
    contractDetails: {
      label: 'How your work is set up',
      placeholder: 'e.g., registered autónomo since 2022, quarterly tax returns',
    },
    income: { label: 'Income', placeholder: 'e.g., averages 2.800 € net per month over the last year' },
    rightToWork: {
      label: 'Visa or residency status',
      placeholder: 'Leave blank if not relevant',
    },
  },
  student: {
    occupation: {
      label: 'What you study, and where',
      placeholder: 'e.g., final year of Nursing at the Universitat de València',
    },
    income: {
      label: 'How your studies are funded',
      placeholder: 'e.g., scholarship covering tuition, family support for living costs',
    },
    rightToWork: {
      label: 'Visa or residency status',
      placeholder: 'e.g., student visa valid to July 2027 — leave blank if not relevant',
    },
  },
  student_working: {
    occupation: {
      label: 'What you study, and what you do alongside it',
      placeholder: 'e.g., Nursing, final year, plus 20h/week at a care home',
    },
    contractDetails: {
      label: 'Contract for the work',
      placeholder: 'e.g., 20h/week contract, renewed annually',
    },
    income: { label: 'Income and funding', placeholder: 'e.g., 900 € net per month plus a scholarship' },
    rightToWork: {
      label: 'Visa or residency status',
      placeholder: 'Leave blank if not relevant',
    },
  },
  retired: {
    occupation: {
      label: 'What you did before retiring',
      placeholder: 'e.g., 30 years as a schoolteacher — optional',
    },
    income: { label: 'Pension or income', placeholder: 'e.g., state pension, 1.600 € per month' },
  },
  not_working: {
    income: {
      label: 'Any income you receive',
      placeholder: 'e.g., unemployment benefit until March, savings covering 12 months',
    },
    rightToWork: {
      label: 'Visa or residency status',
      placeholder: 'Leave blank if not relevant',
    },
  },
};

const ICONS: Record<TextField, typeof Briefcase> = {
  occupation: Briefcase,
  contractDetails: FileSignature,
  income: Wallet,
  rightToWork: Stamp,
};

/** The questions this status actually asks. */
export function visibleFields(status: EmploymentStatus | ''): TextField[] {
  if (!status) return [];
  return (Object.keys(QUESTIONS[status]) as TextField[]).filter((field) => QUESTIONS[status][field]);
}

/**
 * Clears anything the chosen status does not ask about.
 *
 * Someone who types a job, then switches to "not working", must not have that
 * job silently sent to a landlord from a field they can no longer see.
 */
export function pruneToStatus(draft: WorkDraft): WorkDraft {
  const shown = new Set(visibleFields(draft.employmentStatus));
  const pruned = { ...draft };
  for (const field of Object.keys(ICONS) as TextField[]) {
    if (!shown.has(field)) pruned[field] = '';
  }
  return pruned;
}

interface Props {
  value: WorkDraft;
  onChange: (next: WorkDraft) => void;
  /** Whose work this is, for the heading. Omitted in onboarding, where it is obviously yours. */
  name?: string;
}

export default function WorkProfileFields({ value, onChange, name }: Props) {
  const set = (field: keyof WorkDraft, next: string) =>
    onChange({ ...value, [field]: next } as WorkDraft);

  const fields = visibleFields(value.employmentStatus);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider">
          {name ? `${name}, what is your situation?` : 'What is your situation?'}
        </label>
        <Segmented
          name="Employment status"
          layout="grid"
          value={value.employmentStatus}
          onChange={(status) => onChange(pruneToStatus({ ...value, employmentStatus: status }))}
          options={EMPLOYMENT_OPTIONS}
          accent="blue"
        />
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          This is yours alone. Everything below the divider is shared with the household — the
          landlord message says “I” about whoever entered the listing, and names the other members
          for their own work.
        </p>
      </div>

      {fields.map((field) => {
        const copy = QUESTIONS[value.employmentStatus as EmploymentStatus][field]!;
        const Icon = ICONS[field];
        return (
          <div key={field} className="space-y-2">
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5 text-blue-400" />
              {copy.label}
            </label>
            <textarea
              rows={2}
              value={value[field]}
              onChange={(e) => set(field, e.target.value)}
              placeholder={copy.placeholder}
              className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[80px] leading-relaxed resize-y"
            />
          </div>
        );
      })}
    </div>
  );
}
