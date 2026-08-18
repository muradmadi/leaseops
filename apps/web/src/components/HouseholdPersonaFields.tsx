/**
 * The household's shared tenant facts — everything a landlord screens on except
 * work, which belongs to a person and lives in `WorkProfileFields`.
 *
 * One row, shared by both members, so every answer here is written into both
 * their letters. The placeholders name people on purpose: "Murad's parents can
 * act as guarantors" stays true whoever sends the message, while "my parents"
 * quietly becomes false the moment the other member writes.
 */
import {
  Calendar,
  Users,
  HeartHandshake,
  ShieldCheck,
  FolderCheck,
  CalendarClock,
  Clock,
  FileText,
} from 'lucide-react';
import type { HouseholdPersona } from '../lib/persona';

const FIELDS: {
  key: keyof HouseholdPersona;
  label: string;
  placeholder: string;
  icon: typeof Calendar;
  accent: string;
  rows: number;
}[] = [
  {
    key: 'householdComposition',
    label: 'Who will be living in the apartment?',
    placeholder: 'e.g., a couple, both working, no children',
    icon: Users,
    accent: 'text-purple-400',
    rows: 3,
  },
  {
    key: 'pets',
    label: 'Pets or smoking habits',
    placeholder: 'e.g., no pets, neither of us smokes',
    icon: HeartHandshake,
    accent: 'text-amber-400',
    rows: 3,
  },
  {
    key: 'moveInTimeline',
    label: 'Target move-in date and timeline',
    placeholder: 'e.g., around 10 September, ready to sign after a viewing',
    icon: Calendar,
    accent: 'text-blue-400',
    rows: 3,
  },
  {
    key: 'intendedLeaseLength',
    label: 'How long you intend to stay',
    placeholder: 'e.g., minimum 1 year, happy to sign for 2',
    icon: CalendarClock,
    accent: 'text-amber-400',
    rows: 3,
  },
  {
    key: 'financialGuarantees',
    label: 'Financial guarantees you can offer',
    placeholder:
      "e.g., Murad's parents can act as guarantors with bank statements, and we can put up 2–3 months up front — name whose they are, the message is sent by both of you",
    icon: ShieldCheck,
    accent: 'text-blue-400',
    rows: 3,
  },
  {
    key: 'documentsReady',
    label: 'Documents you can provide immediately',
    placeholder: 'e.g., payslips and contracts for both of us, passports, NIE',
    icon: FolderCheck,
    accent: 'text-purple-400',
    rows: 3,
  },
  {
    key: 'viewingAvailability',
    label: 'When you can view the property',
    placeholder:
      'e.g., we are in Madrid until October — video call any evening, or a friend can view for us',
    icon: Clock,
    accent: 'text-emerald-400',
    rows: 3,
  },
  {
    key: 'additionalNotes',
    label: 'Additional strengths or notes',
    placeholder: 'e.g., landlord reference from our current flat, both work from home',
    icon: FileText,
    accent: 'text-emerald-400',
    rows: 4,
  },
];

interface Props {
  value: HouseholdPersona;
  onChange: (next: HouseholdPersona) => void;
}

export default function HouseholdPersonaFields({ value, onChange }: Props) {
  return (
    <div className="space-y-6 sm:space-y-8">
      {FIELDS.map((field) => {
        const Icon = field.icon;
        return (
          <div key={field.key} className="space-y-2">
            <label className="block text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <Icon className={`w-3.5 h-3.5 ${field.accent}`} />
              {field.label}
            </label>
            <textarea
              rows={field.rows}
              value={value[field.key]}
              onChange={(e) => onChange({ ...value, [field.key]: e.target.value })}
              placeholder={field.placeholder}
              className="w-full bg-zinc-900/90 sm:bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-2xl p-4 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[96px] sm:min-h-[110px] leading-relaxed resize-y"
            />
          </div>
        );
      })}
    </div>
  );
}
