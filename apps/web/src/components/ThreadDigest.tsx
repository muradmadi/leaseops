/**
 * Where a conversation with a landlord actually stands.
 *
 * `StageControl` beside it shows the stage *you* declared. This shows what the
 * messages can prove — who spoke last, when, and whether you owe a reply — so a
 * stage that has drifted is visible instead of silently wrong. It is a readout
 * only: nothing here changes the stage, because a board that moves itself stops
 * being a record of what you did.
 *
 * Every value is a restatement of stored rows. Where a message carries no date
 * it says so rather than reaching for `createdAt`, which is when the row was
 * written and not when anything was said.
 */
import { Circle, Clock, MessagesSquare, Send } from 'lucide-react';
import type { ThreadState } from '@leaseops/db';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A stated time as elapsed prose, or `null` when it is not in the past.
 *
 * A future date is a real thing to have entered — you can log a viewing you have
 * arranged — and "in -3 days" is nonsense, so the caller falls back to the date
 * itself for those.
 */
export function formatElapsed(at: number, now = Date.now()): string | null {
  const gap = now - at;
  if (gap < 0) return null;
  if (gap < HOUR) return 'just now';
  if (gap < DAY) {
    const hours = Math.floor(gap / HOUR);
    return `${hours}h ago`;
  }

  const days = Math.floor(gap / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'last week';
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** The stated time in full, for a message bubble. Browser locale, not de-DE. */
export function formatSaidAt(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface Readout {
  Icon: typeof Circle;
  headline: string;
  /** Null whenever nobody has dated the last message. */
  when: string | null;
  tone: string;
  /** True when the ball is in your court, which is the only state worth colouring. */
  yours: boolean;
}

function readThread(thread: ThreadState, now: number): Readout {
  const when =
    thread.lastSpokeAt === null
      ? null
      : formatElapsed(thread.lastSpokeAt, now) ?? formatSaidAt(thread.lastSpokeAt);

  if (thread.exchanged === 0) {
    return {
      Icon: Circle,
      headline: thread.unsent > 0 ? 'Drafted, not sent' : 'Nothing sent yet',
      when: null,
      tone: 'text-zinc-500',
      yours: false,
    };
  }

  if (thread.lastSpeaker === 'landlord') {
    return {
      Icon: MessagesSquare,
      headline:
        thread.awaitingYou > 1 ? `${thread.awaitingYou} replies waiting on you` : 'They replied — your turn',
      when,
      tone: 'text-amber-300',
      yours: true,
    };
  }

  return {
    Icon: Send,
    headline: 'You wrote last — no reply yet',
    when,
    tone: 'text-zinc-400',
    yours: false,
  };
}

interface ThreadDigestProps {
  thread: ThreadState;
  /** `compact` is the dashboard card; `full` is the chat header. */
  size?: 'compact' | 'full';
  /** Injectable so the readout is testable and stable within a render. */
  now?: number;
}

export default function ThreadDigest({ thread, size = 'compact', now = Date.now() }: ThreadDigestProps) {
  const { Icon, headline, when, tone, yours } = readThread(thread, now);

  if (size === 'compact') {
    return (
      <div
        className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold ${
          yours ? 'bg-amber-950/20 border-amber-500/20' : 'bg-zinc-950/50 border-zinc-800/70'
        }`}
      >
        <Icon className={`w-3.5 h-3.5 shrink-0 ${tone}`} />
        <span className={`truncate ${tone}`}>{headline}</span>
        {when && <span className="ml-auto shrink-0 text-zinc-500 font-mono text-[10px]">{when}</span>}
        {!when && thread.exchanged > 0 && (
          <span className="ml-auto shrink-0 text-zinc-600 font-mono text-[10px]">no date</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 rounded-2xl border ${
        yours ? 'bg-amber-950/20 border-amber-500/25' : 'bg-zinc-900/60 border-zinc-800'
      }`}
    >
      <span className={`flex items-center gap-2 text-xs font-bold ${tone}`}>
        <Icon className="w-4 h-4 shrink-0" />
        {headline}
      </span>

      {when && <span className="text-[11px] font-mono text-zinc-500">{when}</span>}

      <span className="ml-auto flex items-center gap-3 text-[11px] font-mono text-zinc-500">
        <span>
          {thread.exchanged} exchanged
          {thread.unsent > 0 && ` · ${thread.unsent} unsent`}
        </span>
        {/* Says why there is no elapsed time rather than showing a made-up one. */}
        {thread.undated > 0 && (
          <span className="flex items-center gap-1 text-zinc-600">
            <Clock className="w-3 h-3 shrink-0" />
            {thread.undated} undated
          </span>
        )}
      </span>
    </div>
  );
}
