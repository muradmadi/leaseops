import React, { useLayoutEffect, useRef, useState } from 'react';
import { useParams, Link } from 'wouter';
import { useApartment, useMessages, useLogMessage, useAiSuggestMessage, useInitMessages, useUpdateMessage, useDeleteMessage } from '../lib/useApartments';
import {
  ArrowLeft,
  X,
  MessageSquare,
  Check,
  Clock,
  Copy,
  Loader2,
  ShieldAlert,
  Sparkles,
  Undo2,
  User,
  Bot,
  Pencil,
  Trash2
} from 'lucide-react';
import ThreadDigest, { formatSaidAt } from '../components/ThreadDigest';
import OutreachAuthorControl from '../components/OutreachAuthorControl';

/**
 * Whether a message went to the landlord — the one thing that decides if the AI
 * treats it as something you said. Stated by hand, never inferred from a copy.
 */
function StatusBadge({ sent }: { sent: boolean }) {
  return (
    <span
      title={
        sent
          ? 'Counted as something you said when drafting the next reply.'
          : 'Left out when drafting the next reply.'
      }
      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border shrink-0 ${
        sent
          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
          : 'bg-zinc-800 text-zinc-400 border-zinc-700'
      }`}
    >
      {sent ? 'Sent' : 'Draft'}
    </span>
  );
}

/**
 * A textarea that is always as tall as what it holds.
 *
 * Editing used to drop a long message into a 60px box, which is a worse view of
 * it than the bubble it replaced. Growing to `scrollHeight` on every change
 * keeps the text where it was on screen; `minHeight` stops a one-line message
 * from collapsing to a sliver.
 */
function AutoTextarea({
  value,
  onChange,
  className,
  minHeight = 120,
  autoFocus,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minHeight?: number;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Layout effect, not effect: measuring after paint makes the box visibly jump.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, [value, minHeight]);

  return (
    <textarea
      ref={ref}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${className} resize-none overflow-hidden`}
    />
  );
}

/**
 * `<input type="datetime-local">` speaks local wall-clock, not an ISO instant,
 * so both directions are converted by hand rather than through `toISOString`,
 * which would shift the value by the timezone offset every round trip.
 */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Epoch ms from that input, or `null` for an empty or unparseable field. */
function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** What a message's stored `sentAt` looks like in the editor, blank if undated. */
function editableSentAt(sentAt: unknown): string {
  if (!sentAt) return '';
  const ms = new Date(sentAt as string).getTime();
  return Number.isFinite(ms) ? toLocalInput(ms) : '';
}

/**
 * When a message was said, shown only where somebody said so.
 *
 * Never `createdAt`. That is when the row was written — you send from your own
 * mail client and log it here a day later — and rendering it as the message time
 * is the bug this whole field exists to fix. Undated offers the fix instead of a
 * guess.
 */
function SaidAt({ sentAt, onAdd }: { sentAt: unknown; onAdd: () => void }) {
  const ms = sentAt ? new Date(sentAt as string).getTime() : NaN;

  if (!Number.isFinite(ms)) {
    return (
      <button
        onClick={onAdd}
        title="Nobody has said when this was sent"
        className="flex items-center gap-1 text-zinc-600 hover:text-zinc-300 transition-colors font-mono text-[10px] font-normal"
      >
        <Clock className="w-3 h-3" />
        add time
      </button>
    );
  }

  return (
    <span className="text-zinc-500 font-mono text-[10px] font-normal">{formatSaidAt(ms)}</span>
  );
}

/**
 * The conversation with one landlord.
 *
 * `sender` has three values and they must stay visually distinct: a message you
 * typed used to render in the AI branch, badged "AI Suggested Reply", which made
 * the thread useless as a record of what you actually sent — and fed that
 * confusion straight back into the next suggestion.
 */
export default function ChatView() {
  const params = useParams();
  const id = params?.id || '';
  const { data: apartment, isLoading: isApartmentLoading } = useApartment(id);
  const { data: messages = [], isLoading: isMessagesLoading } = useMessages(id);
  const logMessageMutation = useLogMessage();
  const aiSuggestMutation = useAiSuggestMessage();
  const initMessagesMutation = useInitMessages();
  const updateMessageMutation = useUpdateMessage();
  const deleteMessageMutation = useDeleteMessage();

  /**
   * `sentAt` is prefilled with the current time and sits in the composer where
   * you can see and change it before saving. That is you stating when it was
   * said — unlike `createdAt`, which the app fills in behind you and which is
   * why timestamps were pulled from this view in the first place.
   */
  const [draftMessage, setDraftMessage] = useState<{
    sender: 'landlord' | 'user';
    text: string;
    sentAt: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; text: string; sentAt: string } | null>(null);

  /** Opens the editor on a message, carrying whatever date it already has. */
  const startEditing = (msg: any) =>
    setEditingMessage({ id: msg.id, text: msg.text, sentAt: editableSentAt(msg.sentAt) });

  const startComposing = (sender: 'landlord' | 'user') =>
    setDraftMessage({ sender, text: '', sentAt: toLocalInput(Date.now()) });

  const busy = logMessageMutation.isPending || aiSuggestMutation.isPending || initMessagesMutation.isPending;
  const actionError = aiSuggestMutation.error || initMessagesMutation.error;

  const handleUpdateMessage = async () => {
    if (!editingMessage || !editingMessage.text.trim()) return;
    await updateMessageMutation.mutateAsync({
      id,
      messageId: editingMessage.id,
      text: editingMessage.text,
      // An emptied field clears the date rather than leaving the old one behind.
      sentAt: fromLocalInput(editingMessage.sentAt),
    });
    setEditingMessage(null);
  };

  if (isApartmentLoading || isMessagesLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="text-sm font-semibold text-zinc-400">Loading conversation...</span>
      </div>
    );
  }

  if (!apartment) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8 space-y-4">
        <ShieldAlert className="w-12 h-12 text-red-400" />
        <h2 className="text-xl font-bold">Listing Not Found</h2>
        <p className="text-sm text-zinc-400">The apartment you are trying to chat about does not exist.</p>
        <Link href="/">
          <button className="px-6 py-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-semibold border border-zinc-800 transition-all">
            Return to Dashboard
          </button>
        </Link>
      </div>
    );
  }

  /**
   * Copying does not change anything. Whether a message went to the landlord is
   * yours to state — you might copy a draft out to edit it elsewhere, and having
   * that silently register as sent would put words in your mouth in the next
   * suggestion.
   */
  const handleCopy = (msg: any) => {
    navigator.clipboard.writeText(msg.text);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId((current) => (current === msg.id ? null : current)), 2500);
  };

  const setStatus = (msg: any, status: 'sent' | 'draft') =>
    updateMessageMutation.mutate({ id, messageId: msg.id, status });

  /** Rejecting removes it, as if the suggestion had never been generated. */
  const handleReject = (msg: any) => deleteMessageMutation.mutate({ id, messageId: msg.id });

  const handleSaveDraft = async (status?: 'sent' | 'draft') => {
    if (!draftMessage || !draftMessage.text.trim()) return;
    const { sender, text, sentAt } = draftMessage;
    setDraftMessage(null);

    await logMessageMutation.mutateAsync({
      id,
      sender,
      text: text.trim(),
      status,
      sentAt: fromLocalInput(sentAt),
    });
  };

  const handleAiSuggest = async () => {
    try {
      await aiSuggestMutation.mutateAsync({ id });
    } catch {
      // Surfaced by the banner below; apiFetch throws on every non-2xx.
    }
  };

  const handleInit = async () => {
    try {
      await initMessagesMutation.mutateAsync(id);
    } catch {
      // Same.
    }
  };

  const formatPrice = (price?: number | null, currency?: string | null) => {
    if (!price) return 'Price N/A';
    const curr = currency || 'EUR';
    try {
      return new Intl.NumberFormat('de-DE', { style: 'currency', currency: curr, maximumFractionDigits: 0 }).format(price);
    } catch {
      return `${price} ${curr}`;
    }
  };

  /*
   * A message's timestamp is `sentAt` and nothing else.
   *
   * `createdAt` is when the row was written, which is not when anything was
   * said: you send a message from your own mail client and mark it sent here a
   * day later, and the bubble would claim you wrote it just now. That version
   * shipped, rendered a bare clock time, and was removed — a thread spanning a
   * week showed five times and no dates, all of them wrong.
   *
   * `sentAt` is the fix, and it is set by hand for the same reason `isActive` is
   * separate from `status`: when something happened is a fact about the
   * conversation, not about the record. Left blank it stays blank, and every
   * readout says "undated" rather than falling back.
   */
  const editor = (msg: any, accent: 'blue' | 'emerald') => (
    <div className="flex flex-col gap-2 mt-2">
      <AutoTextarea
        value={editingMessage!.text}
        onChange={(text) => setEditingMessage({ ...editingMessage!, text })}
        className={`w-full bg-zinc-950 border rounded-lg p-3 text-[16px] sm:text-sm text-zinc-100 placeholder-zinc-500 leading-relaxed focus:outline-none ${
          accent === 'blue' ? 'border-zinc-800 focus:border-blue-500' : 'border-emerald-500/30 focus:border-emerald-500'
        }`}
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">When was this sent?</span>
        <input
          type="datetime-local"
          value={editingMessage!.sentAt}
          onChange={(e) => setEditingMessage({ ...editingMessage!, sentAt: e.target.value })}
          className={`w-full bg-zinc-950 border rounded-lg px-2 min-h-[44px] text-[16px] sm:text-sm text-zinc-100 focus:outline-none ${
            accent === 'blue' ? 'border-zinc-800 focus:border-blue-500' : 'border-emerald-500/30 focus:border-emerald-500'
          }`}
        />
        <span className="text-[10px] text-zinc-600">Leave empty to keep it undated.</span>
      </label>
      <div className="flex gap-2 justify-end">
        <button onClick={() => setEditingMessage(null)} className="min-h-[44px] px-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">Cancel</button>
        <button
          onClick={handleUpdateMessage}
          className={`min-h-[44px] px-4 rounded-lg text-xs font-bold text-white transition-colors ${
            accent === 'blue' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-emerald-600 hover:bg-emerald-500'
          }`}
        >
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] max-h-[100dvh] flex flex-col justify-between bg-zinc-950 text-zinc-100 font-sans selection:bg-blue-500/20 selection:text-blue-400 overflow-hidden">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between gap-4 sticky top-0 z-50 shrink-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-lg sm:text-xl text-zinc-100 truncate">
              {apartment.title || 'Apartment'}
            </h1>
            <span className="bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              Chat
            </span>
          </div>
          <span className="text-xs font-extrabold text-emerald-400 mt-0.5 block">
            {formatPrice(apartment.price, apartment.currency)}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link href={`/apartments/${id}`}>
            <button
              title="Back to Apartment Details"
              className="w-11 h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 shadow-sm"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          </Link>
          <Link href="/">
            <button
              title="Close to Dashboard"
              className="w-11 h-11 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border border-zinc-800 flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </Link>
        </div>
      </header>

      {/* Where this conversation stands, derived from the thread below it. */}
      <div className="px-4 sm:px-6 pt-3 max-w-4xl mx-auto w-full shrink-0 space-y-3">
        <ThreadDigest thread={apartment.thread} size="full" />
        {/* Whose voice the drafts below are in — the place a wrong one is noticed. */}
        <OutreachAuthorControl
          apartmentId={apartment.id}
          outreachAuthorId={apartment.outreachAuthorId}
          createdBy={apartment.createdBy}
        />
      </div>

      {/* Message Stream */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-4xl mx-auto w-full custom-scrollbar">

        {messages.length === 0 && !draftMessage && (
          <div className="flex flex-col items-center justify-center p-8 space-y-4 mt-12 bg-zinc-900/50 border border-zinc-800/80 rounded-3xl animate-in fade-in duration-300">
            <Bot className="w-12 h-12 text-emerald-400" />
            <h2 className="text-xl font-bold text-zinc-100">Start the Conversation</h2>
            <p className="text-sm text-zinc-400 text-center max-w-sm">Draft the first message to the landlord from your household profile and what this listing asks for.</p>
            <button
              onClick={handleInit}
              disabled={initMessagesMutation.isPending}
              className="px-6 py-3 mt-4 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50 cursor-pointer active:scale-95"
            >
              {initMessagesMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              Draft Initial Outreach
            </button>
          </div>
        )}

        {messages.map((msg) => {
          const isEditing = editingMessage?.id === msg.id;

          /* ---------- Landlord ---------- */
          if (msg.sender === 'landlord') {
            return (
              <div key={msg.id} className="flex justify-start items-end gap-2.5 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mb-1">
                  <User className="w-4 h-4" />
                </div>
                <div className="max-w-[85%] sm:max-w-md bg-zinc-900 border border-zinc-800/90 text-zinc-100 rounded-2xl rounded-bl-sm p-4 text-sm space-y-1.5 shadow-lg">
                  <div className="flex items-center justify-between gap-4 text-[10px] font-bold text-zinc-400">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-blue-400 uppercase tracking-wider">Landlord</span>
                      <SaidAt sentAt={msg.sentAt} onAdd={() => startEditing(msg)} />
                    </span>
                    <div className="flex items-center gap-2">
                      <button title="Edit" onClick={() => startEditing(msg)} className="hover:text-zinc-200"><Pencil className="w-3 h-3" /></button>
                      <button title="Delete" onClick={() => deleteMessageMutation.mutate({ id, messageId: msg.id })} className="hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  {isEditing ? editor(msg, 'blue') : (
                    <p className="leading-relaxed text-zinc-200 whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
              </div>
            );
          }

          /* ---------- Your own message ---------- */
          if (msg.sender === 'user') {
            const sent = msg.status !== 'draft';
            return (
              <div key={msg.id} className="flex justify-end items-end gap-2.5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="max-w-[85%] sm:max-w-md bg-blue-950/40 border border-blue-500/30 text-zinc-100 rounded-2xl rounded-br-sm p-4 text-sm space-y-2.5 shadow-lg">
                  <div className="flex items-center justify-between gap-3 text-[10px] font-bold text-zinc-400">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-blue-300 uppercase tracking-wider">You</span>
                      <SaidAt sentAt={msg.sentAt} onAdd={() => startEditing(msg)} />
                    </span>
                    <div className="flex items-center gap-2">
                      <StatusBadge sent={sent} />
                      <button title="Edit" onClick={() => startEditing(msg)} className="hover:text-zinc-200"><Pencil className="w-3 h-3" /></button>
                      <button title="Delete" onClick={() => deleteMessageMutation.mutate({ id, messageId: msg.id })} className="hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  {isEditing ? editor(msg, 'blue') : (
                    <p className="leading-relaxed text-zinc-100 whitespace-pre-wrap">{msg.text}</p>
                  )}
                  <button
                    onClick={() => setStatus(msg, sent ? 'draft' : 'sent')}
                    className="w-full min-h-[44px] rounded-xl bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
                  >
                    {sent ? <Undo2 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    {sent ? 'Move back to draft' : 'Mark as sent'}
                  </button>
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-300 shrink-0 mb-1">
                  <User className="w-4 h-4" />
                </div>
              </div>
            );
          }

          /* ---------- AI suggestion ---------- */
          const isSent = msg.status === 'sent';
          const isOutreach =
            msg.metadata?.kind === 'outreach' ||
            // `generated` is true for both kinds, so it cannot distinguish them.
            // `personaTuned` keeps messages created before `kind` existed labelled correctly.
            (msg.metadata?.generated && !msg.metadata?.kind && !msg.metadata?.personaTuned);

          return (
            <div key={msg.id} className="flex justify-end items-end gap-2.5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="max-w-[85%] sm:max-w-md border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-zinc-900 text-zinc-100 rounded-2xl rounded-br-sm p-4 text-sm space-y-3 shadow-xl shadow-emerald-500/5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5" />
                    {isOutreach ? 'AI Initial Outreach Draft' : 'AI Suggested Reply'}
                    {/* Only meaningful once it went out; a draft has no send time. */}
                    {isSent && <SaidAt sentAt={msg.sentAt} onAdd={() => startEditing(msg)} />}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge sent={isSent} />
                    <button title="Edit" onClick={() => startEditing(msg)} className="text-emerald-400 hover:text-emerald-300"><Pencil className="w-3 h-3" /></button>
                  </div>
                </div>
                {isEditing ? editor(msg, 'emerald') : (
                  <div className="leading-relaxed text-zinc-100 font-medium bg-zinc-950/60 p-3 rounded-xl border border-emerald-500/20 whitespace-pre-wrap">
                    {msg.text}
                  </div>
                )}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    onClick={() => handleCopy(msg)}
                    className={`w-full ${
                      copiedId === msg.id ? 'bg-emerald-400 text-zinc-950' : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                    } font-extrabold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 min-h-[44px] cursor-pointer active:scale-[0.98] shadow-lg shadow-emerald-500/20`}
                  >
                    {copiedId === msg.id ? <Check className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4 stroke-[3]" />}
                    <span>{copiedId === msg.id ? 'Copied!' : 'Copy'}</span>
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStatus(msg, isSent ? 'draft' : 'sent')}
                      className="flex-1 min-h-[44px] rounded-xl bg-zinc-900/70 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                    >
                      {isSent ? <Undo2 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      {isSent ? 'Not sent' : 'Mark sent'}
                    </button>
                    <button
                      onClick={() => handleReject(msg)}
                      title="Remove this suggestion entirely"
                      className="flex-1 min-h-[44px] rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {isSent ? 'Delete' : 'Reject'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mb-1">
                <Bot className="w-4 h-4" />
              </div>
            </div>
          );
        })}

        {draftMessage && (
          draftMessage.sender === 'landlord' ? (
            <div className="flex justify-start items-end gap-2.5 animate-in fade-in slide-in-from-left-4 duration-300">
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mb-1">
                <User className="w-4 h-4" />
              </div>
              <div className="w-full max-w-[85%] sm:max-w-md bg-zinc-900 border border-zinc-800/90 text-zinc-100 rounded-2xl rounded-bl-sm p-4 text-sm space-y-3 shadow-lg">
                <div className="flex items-center justify-between gap-4 text-[10px] font-bold text-zinc-400">
                  <span className="text-blue-400 uppercase tracking-wider">Log landlord reply</span>
                </div>
                <AutoTextarea
                  autoFocus
                  minHeight={100}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-[16px] sm:text-sm text-zinc-100 placeholder-zinc-500 leading-relaxed focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  placeholder="Paste what the landlord wrote back..."
                  value={draftMessage.text}
                  onChange={(text) => setDraftMessage({ ...draftMessage, text })}
                />
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">When was this sent?</span>
                  <input
                    type="datetime-local"
                    value={draftMessage.sentAt}
                    onChange={(e) => setDraftMessage({ ...draftMessage, sentAt: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 min-h-[44px] text-[16px] sm:text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  />
                </label>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDraftMessage(null)} className="px-4 min-h-[44px] rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-100 transition-colors">Cancel</button>
                  <button onClick={() => handleSaveDraft()} disabled={!draftMessage.text.trim()} className="px-4 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 cursor-pointer active:scale-95">Save Message</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-end items-end gap-2.5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="w-full max-w-[85%] sm:max-w-md bg-blue-950/40 border border-blue-500/30 text-zinc-100 rounded-2xl rounded-br-sm p-4 text-sm space-y-3 shadow-lg">
                <div className="flex items-center justify-between gap-4 text-[10px] font-bold text-zinc-400">
                  <span className="text-blue-300 uppercase tracking-wider">Your message</span>
                </div>
                <AutoTextarea
                  autoFocus
                  minHeight={100}
                  className="w-full bg-zinc-950 border border-blue-500/30 rounded-xl p-3 text-[16px] sm:text-sm text-zinc-100 placeholder-zinc-500 leading-relaxed focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  placeholder="Write or paste your message..."
                  value={draftMessage.text}
                  onChange={(text) => setDraftMessage({ ...draftMessage, text })}
                />
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">When was this sent?</span>
                  <input
                    type="datetime-local"
                    value={draftMessage.sentAt}
                    onChange={(e) => setDraftMessage({ ...draftMessage, sentAt: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 min-h-[44px] text-[16px] sm:text-sm text-zinc-100 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50"
                  />
                </label>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDraftMessage(null)} className="px-4 min-h-[44px] rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-100 transition-colors">Cancel</button>
                  <button onClick={() => handleSaveDraft('draft')} disabled={!draftMessage.text.trim()} className="px-4 min-h-[44px] rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer active:scale-95">Save as draft</button>
                  <button onClick={() => handleSaveDraft('sent')} disabled={!draftMessage.text.trim()} className="px-4 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 cursor-pointer active:scale-95">Save as sent</button>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-300 shrink-0 mb-1">
                <User className="w-4 h-4" />
              </div>
            </div>
          )
        )}
      </main>

      {/* Input Logger Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/95 backdrop-blur-md p-3 sm:p-4 shrink-0">
        <div className="max-w-4xl mx-auto flex flex-col gap-3">
          {actionError && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 text-red-300 rounded-xl px-4 py-3 text-xs font-semibold animate-in fade-in duration-200">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{actionError.message}</span>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center items-center">
            <button
              onClick={() => startComposing('landlord')}
              disabled={busy || !!draftMessage}
              className="flex-1 w-full min-h-[44px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-blue-400 font-bold px-4 py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-sm disabled:opacity-40"
            >
              <User className="w-4 h-4" />
              <span>Add Landlord Response</span>
            </button>
            <button
              onClick={() => startComposing('user')}
              disabled={busy || !!draftMessage}
              className="flex-1 w-full min-h-[44px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-blue-300 font-bold px-4 py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-sm disabled:opacity-40"
            >
              <User className="w-4 h-4" />
              <span>Add Your Message</span>
            </button>
            <button
              onClick={handleAiSuggest}
              disabled={busy || !!draftMessage || messages.length === 0}
              title={messages.length === 0 ? 'Draft the initial outreach first' : undefined}
              className="flex-1 w-full min-h-[44px] bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-extrabold px-4 py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-40"
            >
              {aiSuggestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              <span>AI Suggestion</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
