import { describe, it, expect } from 'bun:test';
import { summariseThread, countsAsSent, type ThreadTurn } from './thread';

/** Shorthands matching how the chat actually writes rows. */
const owner = (sentAt?: Date | null): ThreadTurn => ({ sender: 'landlord', sentAt: sentAt ?? null });
const mine = (sentAt?: Date | null): ThreadTurn => ({ sender: 'user', status: 'sent', sentAt: sentAt ?? null });
const draft = (): ThreadTurn => ({ sender: 'ai_suggestion', status: 'draft' });
const aiSent = (sentAt?: Date | null): ThreadTurn => ({
  sender: 'ai_suggestion',
  status: 'sent',
  sentAt: sentAt ?? null,
});

const JAN = new Date('2026-01-10T09:00:00.000Z');
const FEB = new Date('2026-02-10T09:00:00.000Z');

describe('summariseThread', () => {
  it('reports an empty thread as nothing having happened', () => {
    expect(summariseThread([])).toEqual({
      exchanged: 0,
      lastSpeaker: null,
      lastSpokeAt: null,
      awaitingYou: 0,
      unsent: 0,
      undated: 0,
    });
  });

  it('does not count a draft as an exchange', () => {
    const state = summariseThread([draft()]);

    expect(state.exchanged).toBe(0);
    expect(state.unsent).toBe(1);
    expect(state.lastSpeaker).toBeNull();
  });

  it('puts the turn on you when the landlord spoke last', () => {
    const state = summariseThread([aiSent(JAN), owner(FEB)]);

    expect(state.lastSpeaker).toBe('landlord');
    expect(state.awaitingYou).toBe(1);
    expect(state.exchanged).toBe(2);
  });

  it('counts every landlord message since you last spoke, not just the newest', () => {
    const state = summariseThread([mine(JAN), owner(), owner(), owner(FEB)]);

    expect(state.awaitingYou).toBe(3);
  });

  it('puts the turn on them once you have replied', () => {
    const state = summariseThread([owner(JAN), mine(FEB)]);

    expect(state.lastSpeaker).toBe('you');
    expect(state.awaitingYou).toBe(0);
  });

  it('reads the last exchanged time, and skips over drafts written after it', () => {
    const state = summariseThread([mine(JAN), owner(FEB), draft()]);

    expect(state.lastSpeaker).toBe('landlord');
    expect(state.lastSpokeAt).toBe(FEB.getTime());
    expect(state.unsent).toBe(1);
  });

  /**
   * The whole reason `sentAt` is its own nullable column. An undated message
   * must report no time rather than borrow `createdAt`, which is when the row
   * was written and not when anything was said.
   */
  it('reports no time for an undated message instead of inventing one', () => {
    const state = summariseThread([mine(JAN), owner(null)]);

    expect(state.lastSpokeAt).toBeNull();
    expect(state.undated).toBe(1);
  });

  it('counts undated messages so the readout can say why it shows no time', () => {
    const state = summariseThread([mine(), owner(), owner(FEB)]);

    expect(state.exchanged).toBe(3);
    expect(state.undated).toBe(2);
    expect(state.lastSpokeAt).toBe(FEB.getTime());
  });

  it('accepts a timestamp in whatever shape the row or the wire delivered', () => {
    expect(summariseThread([{ sender: 'landlord', sentAt: JAN }]).lastSpokeAt).toBe(JAN.getTime());
    expect(summariseThread([{ sender: 'landlord', sentAt: JAN.getTime() }]).lastSpokeAt).toBe(JAN.getTime());
    expect(summariseThread([{ sender: 'landlord', sentAt: JAN.toISOString() }]).lastSpokeAt).toBe(JAN.getTime());
    expect(summariseThread([{ sender: 'landlord', sentAt: 'not a date' }]).lastSpokeAt).toBeNull();
  });

  /**
   * Legacy rows carry `'ready'` and nobody ever said whether they went out.
   * `countsAsSent` resolves them by the thread's shape, and the readout has to
   * agree with the transcript the model sees — one definition, asserted here.
   */
  it('resolves pre-status rows the same way the reply prompt does', () => {
    const legacyOutreach: ThreadTurn = { sender: 'ai_suggestion', status: 'ready' };
    const withReply = [legacyOutreach, owner(FEB)];

    expect(countsAsSent(withReply, 0)).toBe(true);
    expect(summariseThread(withReply).exchanged).toBe(2);

    const neverAnswered = [legacyOutreach];
    expect(countsAsSent(neverAnswered, 0)).toBe(false);
    expect(summariseThread(neverAnswered).unsent).toBe(1);
  });

  it('treats a message you typed as yours even before the status buttons existed', () => {
    const state = summariseThread([{ sender: 'user', status: 'ready' }]);

    expect(state.lastSpeaker).toBe('you');
    expect(state.exchanged).toBe(1);
    expect(state.unsent).toBe(0);
  });
});
