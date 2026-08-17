/**
 * What a conversation with a landlord currently looks like, derived from the
 * stored messages and nothing else.
 *
 * `pipelineStage` on the apartment is the stage *you* declared. This is the
 * state the record can actually prove: who spoke last, whether you owe a reply,
 * how many drafts are still sitting unsent. Nothing here writes back to the
 * stage — a pipeline that advances itself stops being a record of what you did.
 * It exists so the stage you maintain by hand is checkable against the thread.
 *
 * Everything below is a restatement of stored rows. It never fills a gap: an
 * undated message reports no date rather than borrowing `createdAt`.
 */

import type { Apartment } from './schema/apartments';

/** One stored message, reduced to what a thread readout needs. */
export interface ThreadTurn {
  sender: string;
  /**
   * `'sent'` or `'draft'`, set by hand in the chat. `'ready'` is the old default
   * and means nobody ever said — see `countsAsSent`.
   */
  status?: string | null;
  /** When it was said, as stated by a person. Null means nobody has dated it. */
  sentAt?: Date | number | string | null;
}

/**
 * Whether a turn actually went to the landlord.
 *
 * Rows written before the sent/draft buttons existed carry `'ready'` and nobody
 * ever said, so they are resolved by kind:
 *
 *   - a message the tenant typed is theirs by definition → sent
 *   - an AI draft falls back to the thread's own shape:
 *       a LANDLORD turn follows it   → they were replying to something, so it went
 *       a USER turn follows it first → the tenant wrote their own words instead
 *       nothing follows it            → still sitting on screen unused
 *
 * This lives here rather than beside the reply prompt because two things now
 * depend on it — the transcript the model sees and the thread readout the user
 * sees — and the two disagreeing about what was sent would be a real bug.
 */
export function countsAsSent(history: ThreadTurn[], index: number): boolean {
  const turn = history[index];
  if (!turn) return false;
  if (turn.status === 'sent') return true;
  if (turn.status === 'draft') return false;

  if (turn.sender === 'user') return true;

  for (let i = index + 1; i < history.length; i++) {
    const sender = history[i].sender;
    if (sender === 'landlord') return true;
    if (sender === 'user') return false;
  }
  return false;
}

export interface ThreadState {
  /**
   * Messages that actually passed between the two sides. A draft is not an
   * exchange, so this is not `messages.length`.
   */
  exchanged: number;
  /** Who spoke last of those, or null when nothing has been exchanged yet. */
  lastSpeaker: 'landlord' | 'you' | null;
  /** When that message was said, in epoch ms. Null when nobody has dated it. */
  lastSpokeAt: number | null;
  /**
   * Landlord messages since your last sent one — what you owe an answer to.
   * Zero whenever the last word was yours, which is the "waiting on them" case.
   */
  awaitingYou: number;
  /** Messages written but never marked sent. Yours to send or delete. */
  unsent: number;
  /**
   * Exchanged messages carrying no `sentAt`. The readout shows no elapsed time
   * while this is non-zero, and says why rather than inventing one.
   */
  undated: number;
}

const EMPTY_THREAD: ThreadState = {
  exchanged: 0,
  lastSpeaker: null,
  lastSpokeAt: null,
  awaitingYou: 0,
  unsent: 0,
  undated: 0,
};

/** Epoch ms from whatever shape the row or the wire delivered, or null. */
function toMillis(value: ThreadTurn['sentAt']): number | null {
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Reduces a thread, in chronological order, to its current state.
 *
 * Pure and dependency-free so both the API and the browser can hold the same
 * idea of where a conversation stands.
 */
export function summariseThread(history: ThreadTurn[]): ThreadState {
  if (history.length === 0) return { ...EMPTY_THREAD };

  const state: ThreadState = { ...EMPTY_THREAD };

  // The record of what actually happened, drafts excluded.
  const exchanged: Array<{ speaker: 'landlord' | 'you'; at: number | null }> = [];

  history.forEach((turn, i) => {
    if (turn.sender === 'landlord') {
      exchanged.push({ speaker: 'landlord', at: toMillis(turn.sentAt) });
      return;
    }
    if (countsAsSent(history, i)) {
      exchanged.push({ speaker: 'you', at: toMillis(turn.sentAt) });
      return;
    }
    state.unsent += 1;
  });

  state.exchanged = exchanged.length;
  state.undated = exchanged.filter((turn) => turn.at === null).length;

  const last = exchanged[exchanged.length - 1];
  if (!last) return state;

  state.lastSpeaker = last.speaker;
  state.lastSpokeAt = last.at;

  // Everything the landlord has said since you last spoke. Counted rather than
  // flagged: three unanswered messages is a different situation from one.
  for (let i = exchanged.length - 1; i >= 0; i--) {
    if (exchanged[i].speaker !== 'landlord') break;
    state.awaitingYou += 1;
  }

  return state;
}

/**
 * A listing as the dashboard and the chat receive it: the stored row plus the
 * state of its conversation.
 *
 * `thread` is derived on every read rather than stored, so it cannot go stale
 * against the messages it describes and there is no column to keep in step.
 */
export type ApartmentWithThread = Apartment & { thread: ThreadState };
