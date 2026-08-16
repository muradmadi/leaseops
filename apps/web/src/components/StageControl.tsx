/**
 * The outreach pipeline stage, shown and changed in place.
 *
 * This is the fourth axis of a listing and the only one a person drives: the
 * score says how well it matches, `isActive` says whether you decided to chase
 * it, `archivedAt` says whether it is still on the board, and this says how far
 * the conversation actually got. Nothing advances it automatically — a board
 * that moves itself stops being a record of what you did.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Circle, Send, MessagesSquare, CalendarCheck, Trophy, XCircle } from 'lucide-react';
import type { PipelineStage } from '@leaseops/db';

interface StageMeta {
  value: PipelineStage;
  label: string;
  Icon: typeof Circle;
  /** Colour carries the meaning at a glance, so it must not repeat across stages. */
  tone: string;
  dot: string;
}

export const STAGES = [
  { value: 'NOT_CONTACTED', label: 'Not contacted', Icon: Circle, tone: 'text-zinc-400 border-zinc-700 bg-zinc-900/60', dot: 'bg-zinc-500' },
  { value: 'OUTREACH_SENT', label: 'Outreach sent', Icon: Send, tone: 'text-blue-300 border-blue-500/40 bg-blue-950/30', dot: 'bg-blue-400' },
  { value: 'IN_CONVERSATION', label: 'In conversation', Icon: MessagesSquare, tone: 'text-violet-300 border-violet-500/40 bg-violet-950/30', dot: 'bg-violet-400' },
  { value: 'VIEWING_BOOKED', label: 'Viewing booked', Icon: CalendarCheck, tone: 'text-amber-300 border-amber-500/40 bg-amber-950/30', dot: 'bg-amber-400' },
  { value: 'WON', label: 'Got it', Icon: Trophy, tone: 'text-emerald-300 border-emerald-500/40 bg-emerald-950/30', dot: 'bg-emerald-400' },
  { value: 'LOST', label: 'Lost it', Icon: XCircle, tone: 'text-red-300 border-red-500/40 bg-red-950/30', dot: 'bg-red-400' },
] as const satisfies readonly StageMeta[];

/**
 * Compile-time proof that every stage in the schema has UI metadata. Add a stage
 * to `PIPELINE_STAGES` without adding it here and this line stops compiling —
 * otherwise the new stage would simply never appear in the menu, and the control
 * would silently render the wrong label for it.
 */
type _StagesAreExhaustive = Exclude<PipelineStage, (typeof STAGES)[number]['value']> extends never
  ? true
  : never;
const _stagesCoverAll: _StagesAreExhaustive = true;
void _stagesCoverAll;

export function stageMeta(stage: PipelineStage | null | undefined): StageMeta {
  return STAGES.find((s) => s.value === stage) ?? STAGES[0];
}

interface StageControlProps {
  stage: PipelineStage | null | undefined;
  onChange: (stage: PipelineStage) => void;
  disabled?: boolean;
  /** `compact` is the dashboard card; `full` is the detail header. */
  size?: 'compact' | 'full';
}

export default function StageControl({ stage, onChange, disabled, size = 'compact' }: StageControlProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = stageMeta(stage);

  /**
   * Anchors the portalled menu to the button. Flips above when there is not
   * enough room below, so a card near the bottom of the window does not push the
   * list off-screen — the failure this portal exists to prevent, in another form.
   */
  const place = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimated = STAGES.length * 44 + 8;
    const below = window.innerHeight - r.bottom;
    const flip = below < estimated && r.top > below;
    setRect({
      top: flip ? Math.max(8, r.top - estimated) : r.bottom + 6,
      left: r.left,
      width: r.width,
    });
  }, []);

  // A menu that stays open after you click away covers the card underneath it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    // Fixed coordinates go stale the moment anything scrolls, so reposition
    // rather than leave the menu floating away from its button.
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const { Icon } = current;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          // The card behind this is a link to the detail view.
          e.stopPropagation();
          e.preventDefault();
          if (!open) place();
          setOpen((v) => !v);
        }}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border transition-all disabled:opacity-50 cursor-pointer ${current.tone} ${
          size === 'compact' ? 'px-3 py-2.5 min-h-[44px]' : 'px-4 py-2.5 min-h-[44px]'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider truncate">{current.label}</span>
        </span>
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-[100] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        >
          {STAGES.map((s) => {
            const selected = s.value === current.value;
            return (
              <button
                key={s.value}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setOpen(false);
                  if (!selected) onChange(s.value);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[44px] text-left transition-colors ${
                  selected ? 'bg-zinc-800' : 'hover:bg-zinc-800/60'
                }`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                <span className="text-xs font-semibold text-zinc-200 flex-1 truncate">{s.label}</span>
                {selected && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
