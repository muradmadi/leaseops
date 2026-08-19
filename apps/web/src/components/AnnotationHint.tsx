/**
 * Teaches the [[ ]] convention that lets a fact carry its own disclosure rule.
 *
 * The draft used to spend its whole word budget the moment it was given a fact —
 * naming the deposit amount and reciting the document list to landlords who had
 * asked for neither. Neither prompt wording nor withholding the field fixed it:
 * a rule applies to every fact at once, and a removed field cannot come back
 * when a listing does ask. A note is per-fact and conditional, so the person who
 * knows what a card is worth is the one who decides when it gets played.
 *
 * Shown wherever those facts are typed, because the convention is invisible
 * otherwise — nothing in a textarea suggests that brackets mean anything.
 */
import { MessageSquareQuote } from 'lucide-react';

interface Props {
  /** `full` introduces the idea; `compact` reminds someone already past the intro. */
  variant?: 'full' | 'compact';
}

export default function AnnotationHint({ variant = 'compact' }: Props) {
  if (variant === 'compact') {
    return (
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Add a note in{' '}
        <code className="text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded px-1 py-0.5 font-mono text-[10px]">
          [[double brackets]]
        </code>{' '}
        after any answer to say how it should be used — “
        <span className="text-zinc-400">don't volunteer this</span>”, “
        <span className="text-zinc-400">lead with it</span>”, “
        <span className="text-zinc-400">only if they ask</span>”. Landlords never see the notes.
      </p>
    );
  }

  return (
    <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 sm:p-5 space-y-3">
      <h3 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
        <MessageSquareQuote className="w-4 h-4" />
        Tell it how to use each answer
      </h3>
      <p className="text-xs text-zinc-400 leading-relaxed">
        After any answer, add a note in{' '}
        <code className="text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded px-1 py-0.5 font-mono text-[10px]">
          [[double brackets]]
        </code>
        . It is a message to the drafter, not to the landlord — say whether a fact should lead, wait
        to be asked for, or never be volunteered at all. The landlord never sees it.
      </p>
      <div className="bg-zinc-950/70 border border-zinc-800 rounded-xl p-3.5 space-y-2.5 font-mono text-[11px] leading-relaxed">
        <p className="text-zinc-300">
          2.600 € net per month{' '}
          <span className="text-purple-300">[[don't volunteer this — only if they ask about income]]</span>
        </p>
        <p className="text-zinc-300">
          Indefinite contract, 30h/week on a student visa{' '}
          <span className="text-purple-300">[[always mention the visa alongside the contract]]</span>
        </p>
      </div>
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Without notes everything is fair game, and the first message tends to say all of it at once.
        Notes are what keep a card in your hand until it is worth playing.
      </p>
    </div>
  );
}
