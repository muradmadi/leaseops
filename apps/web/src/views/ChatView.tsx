import React, { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useApartment, useMessages, useLogMessage, useAiSuggestMessage, useInitMessages, useUpdateMessage, useDeleteMessage } from '../lib/useApartments';
import {
  ArrowLeft,
  X,
  MessageSquare,
  Check,
  Loader2,
  ShieldAlert,
  Sparkles,
  User,
  Bot,
  Pencil,
  Trash2
} from 'lucide-react';

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

  const [draftMessage, setDraftMessage] = useState<{sender: 'landlord' | 'user', text: string} | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingMessage, setEditingMessage] = useState<{ id: string, text: string } | null>(null);

  const handleUpdateMessage = async () => {
    if (!editingMessage || !editingMessage.text.trim()) return;
    await updateMessageMutation.mutateAsync({ id, messageId: editingMessage.id, text: editingMessage.text });
    setEditingMessage(null);
  };

  if (isApartmentLoading || isMessagesLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="text-sm font-semibold text-zinc-400">
          {isMessagesLoading ? 'AI is analyzing profile and drafting outreach message...' : 'Loading communications hub...'}
        </span>
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveDraft = async () => {
    if (!draftMessage || !draftMessage.text.trim()) return;
    const { sender, text } = draftMessage;
    setDraftMessage(null);

    await logMessageMutation.mutateAsync({
      id,
      sender,
      text: text.trim(),
      metadata: { originalLanguage: sender === 'landlord' ? 'Auto-detected' : 'English', translated: sender === 'landlord' },
    });
  };

  const handleAiSuggest = async () => {
    await aiSuggestMutation.mutateAsync({ id });
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

      {/* Message Stream */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 max-w-4xl mx-auto w-full custom-scrollbar">

        {messages.length === 0 && !draftMessage && (
          <div className="flex flex-col items-center justify-center p-8 space-y-4 mt-12 bg-zinc-900/50 border border-zinc-800/80 rounded-3xl animate-in fade-in duration-300">
            <Bot className="w-12 h-12 text-emerald-400" />
            <h2 className="text-xl font-bold text-zinc-100">Start the Conversation</h2>
            <p className="text-sm text-zinc-400 text-center max-w-sm">Generate a highly personalized initial AI outreach message based on your tenant persona and the property's metrics.</p>
            <button
              onClick={() => initMessagesMutation.mutate(id)}
              disabled={initMessagesMutation.isPending}
              className="px-6 py-3 mt-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-50"
            >
              {initMessagesMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              Draft Initial Outreach
            </button>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.sender === 'landlord') {
            return (
              <div key={msg.id} className="flex justify-start items-end gap-2.5 animate-in fade-in slide-in-from-left-4 duration-300">
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mb-1">
                  <User className="w-4 h-4" />
                </div>
                <div className="max-w-[85%] sm:max-w-md bg-zinc-900 border border-zinc-800/90 text-zinc-100 rounded-2xl rounded-bl-sm p-4 text-sm space-y-1.5 shadow-lg">
                  <div className="flex items-center justify-between gap-4 text-[10px] font-bold text-zinc-400">
                    <span className="text-blue-400 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      Landlord ({msg.metadata?.originalLanguage || 'Auto'} → English)
                    </span>
                    <div className="flex items-center gap-2">
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      <button onClick={() => setEditingMessage({ id: msg.id, text: msg.text })} className="hover:text-zinc-200"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => deleteMessageMutation.mutate({ id, messageId: msg.id })} className="hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  {editingMessage && editingMessage.id === msg.id ? (
                    <div className="flex flex-col gap-2 mt-2">
                      <textarea
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 min-h-[60px]"
                        value={editingMessage.text}
                        onChange={(e) => setEditingMessage({ ...editingMessage, text: e.target.value })}
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingMessage(null)} className="text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
                        <button onClick={handleUpdateMessage} className="text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-white font-bold">Save</button>
                      </div>
                    </div>
                  ) : (
                    <p className="leading-relaxed text-zinc-200 whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
              </div>
            );
          } else {
            return (
              <div key={msg.id} className="flex justify-end items-end gap-2.5 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="max-w-[85%] sm:max-w-md border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-zinc-900 text-zinc-100 rounded-2xl rounded-br-sm p-4 text-sm space-y-3 shadow-xl shadow-emerald-500/5">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5" />
                      {/* `generated` is true for both kinds, so it cannot distinguish them.
                          `personaTuned` keeps messages created before `kind` existed labelled correctly. */}
                      {msg.metadata?.kind === 'outreach' ||
                      (msg.metadata?.generated && !msg.metadata?.kind && !msg.metadata?.personaTuned)
                        ? 'AI Initial Outreach Draft'
                        : 'AI Suggested Reply'}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                        {msg.status || 'Ready'}
                      </span>
                      <button onClick={() => setEditingMessage({ id: msg.id, text: msg.text })} className="text-emerald-400 hover:text-emerald-300"><Pencil className="w-3 h-3" /></button>
                      <button onClick={() => deleteMessageMutation.mutate({ id, messageId: msg.id })} className="text-red-400/80 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                  {editingMessage && editingMessage.id === msg.id ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        className="w-full bg-zinc-950 border border-emerald-500/30 rounded-lg p-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 min-h-[60px]"
                        value={editingMessage.text}
                        onChange={(e) => setEditingMessage({ ...editingMessage, text: e.target.value })}
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditingMessage(null)} className="text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
                        <button onClick={handleUpdateMessage} className="text-xs bg-emerald-600 hover:bg-emerald-500 px-2 py-1 rounded text-white font-bold">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="leading-relaxed text-zinc-100 font-medium bg-zinc-950/60 p-3 rounded-xl border border-emerald-500/20 whitespace-pre-wrap">
                      {msg.text}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => handleCopy(msg.text)}
                      className={`flex-1 ${
                        copied ? 'bg-emerald-400 text-zinc-950' : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950'
                      } font-extrabold py-3 px-4 rounded-xl text-xs transition-all flex items-center justify-center gap-2 min-h-[44px] cursor-pointer active:scale-95 shadow-lg shadow-emerald-500/20`}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>{copied ? 'Copied to Clipboard!' : 'Copy & Mark Reached Out'}</span>
                    </button>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mb-1">
                  <Bot className="w-4 h-4" />
                </div>
              </div>
            );
          }
        })}

        {draftMessage && (
          draftMessage.sender === 'landlord' ? (
            <div className="flex justify-start items-end gap-2.5 animate-in fade-in slide-in-from-left-4 duration-300">
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 shrink-0 mb-1">
                <User className="w-4 h-4" />
              </div>
              <div className="w-full max-w-[85%] sm:max-w-md bg-zinc-900 border border-zinc-800/90 text-zinc-100 rounded-2xl rounded-bl-sm p-4 text-sm space-y-3 shadow-lg">
                <div className="flex items-center justify-between gap-4 text-[10px] font-bold text-zinc-400">
                  <span className="text-blue-400 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    New Landlord Response
                  </span>
                </div>
                <textarea
                  autoFocus
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 min-h-[80px]"
                  placeholder="Type landlord's response here..."
                  value={draftMessage.text}
                  onChange={(e) => setDraftMessage({ ...draftMessage, text: e.target.value })}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDraftMessage(null)} className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-100 transition-colors">Cancel</button>
                  <button onClick={handleSaveDraft} disabled={!draftMessage.text.trim()} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50">Save Message</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-end items-end gap-2.5 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="w-full max-w-[85%] sm:max-w-md border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-950/40 to-zinc-900 text-zinc-100 rounded-2xl rounded-br-sm p-4 text-sm space-y-3 shadow-xl shadow-emerald-500/5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    New User Message
                  </span>
                </div>
                <textarea
                  autoFocus
                  className="w-full bg-zinc-950 border border-emerald-500/30 rounded-xl p-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 min-h-[80px]"
                  placeholder="Type your response here..."
                  value={draftMessage.text}
                  onChange={(e) => setDraftMessage({ ...draftMessage, text: e.target.value })}
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setDraftMessage(null)} className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-zinc-100 transition-colors">Cancel</button>
                  <button onClick={handleSaveDraft} disabled={!draftMessage.text.trim()} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50">Save Message</button>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0 mb-1">
                <User className="w-4 h-4" />
              </div>
            </div>
          )
        )}
      </main>

      {/* Input Logger Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950/95 backdrop-blur-md p-3 sm:p-4 shrink-0">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center items-center">
          <button
            onClick={() => setDraftMessage({ sender: 'landlord', text: '' })}
            disabled={logMessageMutation.isPending || aiSuggestMutation.isPending || !!draftMessage}
            className="flex-1 w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-blue-400 font-bold px-4 py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-sm disabled:opacity-40"
          >
            <User className="w-4 h-4" />
            <span>Add Landlord Response</span>
          </button>
          <button
            onClick={() => setDraftMessage({ sender: 'user', text: '' })}
            disabled={logMessageMutation.isPending || aiSuggestMutation.isPending || !!draftMessage}
            className="flex-1 w-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-emerald-400 font-bold px-4 py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-sm disabled:opacity-40"
          >
            <User className="w-4 h-4" />
            <span>Add User Response</span>
          </button>
          <button
            onClick={handleAiSuggest}
            disabled={logMessageMutation.isPending || aiSuggestMutation.isPending || !!draftMessage}
            className="flex-1 w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-extrabold px-4 py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 shadow-lg shadow-emerald-500/20 disabled:opacity-40"
          >
            {aiSuggestMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            <span>AI Suggestion</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
