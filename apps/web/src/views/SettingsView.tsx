import React, { useState } from 'react';
import Segmented, {
  GENDER_OPTIONS,
  FORM_OPTIONS,
  type Gender,
  type GrammaticalForm,
} from '../components/Segmented';
import { Link } from 'wouter';
import {
  ArrowLeft,
  User,
  LogOut,
  Sparkles,
  Settings,
  Home,
  Copy,
  Check,
  RefreshCw,
  Users,
  AlertTriangle,
  Archive,
  RotateCcw,
  Trash2,
  KeyRound,
  Download,
  Calculator,
  Loader2,
} from 'lucide-react';
import { useAuth, useLogout } from '../lib/useAuth';
import {
  useHousehold,
  useRotateJoinCode,
  useJoinHousehold,
  useUpdateMember,
  useSetLlmKey,
  useClearLlmKey,
  useImportEnvLlmKey,
  useSetLlmModel,
  useLlmModels,
  type AvailableModel,
} from '../lib/useHousehold';
import {
  useArchivedApartments,
  useRestoreApartment,
  usePermanentlyDeleteApartment,
  useRescoreAll,
} from '../lib/useApartments';

/** How many models the picker shows before the "show all" toggle. */
const MODELS_SHOWN_COLLAPSED = 4;

/** `1000000` → `1M context`. Null stays null — nothing is estimated. */
function formatContextWindow(tokens: number | null): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${Math.round(tokens / 1_000_000)}M context`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K context`;
  return `${tokens} context`;
}

export default function SettingsView() {
  const { data: authState } = useAuth();
  const logoutMutation = useLogout();
  const { data: household, isLoading: householdLoading } = useHousehold();
  const rotateMutation = useRotateJoinCode();
  const joinMutation = useJoinHousehold();
  const memberMutation = useUpdateMember();
  const [draftGender, setDraftGender] = useState<Gender | ''>('');
  const [draftForm, setDraftForm] = useState<GrammaticalForm | ''>('');
  const { data: archived = [], isLoading: archiveLoading } = useArchivedApartments();
  const restoreMutation = useRestoreApartment();
  const purgeMutation = usePermanentlyDeleteApartment();
  const rescoreAll = useRescoreAll();
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');

  const setKeyMutation = useSetLlmKey();
  const clearKeyMutation = useClearLlmKey();
  const importEnvKeyMutation = useImportEnvLlmKey();
  const setModelMutation = useSetLlmModel();
  const { data: catalogue, isLoading: modelsLoading } = useLlmModels();
  const [keyDraft, setKeyDraft] = useState('');
  const [showKeyForm, setShowKeyForm] = useState(false);
  const [confirmRemoveKey, setConfirmRemoveKey] = useState(false);
  const [showAllModels, setShowAllModels] = useState(false);

  const llm = household?.llm;

  /**
   * The catalogue, guaranteed to contain whatever is currently selected.
   *
   * A household can be pointed at a model its current key no longer lists — the
   * key was replaced, or Anthropic retired it. Dropping it from the list would
   * show no selection at all, which reads as "nothing is set" when something very
   * much is.
   */
  const models: AvailableModel[] = (() => {
    const fetched = catalogue?.models ?? [];
    if (!llm?.model || fetched.some((m) => m.id === llm.model)) return fetched;
    return [
      { id: llm.model, displayName: llm.model, rate: null, contextWindow: null, releasedAt: null },
      ...fetched,
    ];
  })();
  const visibleModels = showAllModels ? models : models.slice(0, MODELS_SHOWN_COLLAPSED);
  const payer = household?.members.find((m) => m.id === llm?.setBy);
  const payerIsMe = Boolean(llm?.setBy && llm.setBy === authState?.user?.id);
  /** What the household is billed under, in words. Null when nothing is set. */
  const payerLabel = !llm?.keySet
    ? null
    : payerIsMe
      ? 'your key'
      : payer
        ? `${payer.displayName?.trim() || payer.username}'s key`
        : 'a key from a member who has since left';

  const submitKey = () => {
    setKeyMutation.mutate(keyDraft.trim(), {
      onSuccess: () => {
        setKeyDraft('');
        setShowKeyForm(false);
      },
    });
  };

  const copyCode = async () => {
    if (!household?.joinCode) return;
    try {
      await navigator.clipboard.writeText(household.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable outside a secure context; the code stays
      // selectable on screen, so there is nothing to fall back to.
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      {/* Top Navigation Bar */}
      <header className="border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <button className="p-2 -ml-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-all active:scale-95 flex items-center gap-2 cursor-pointer">
              <ArrowLeft className="w-5 h-5" />
              <span className="font-bold text-sm">Back</span>
            </button>
          </Link>
        </div>
        <div className="flex items-center gap-2 text-zinc-100">
          <Settings className="w-5 h-5 text-emerald-500" />
          <span className="font-extrabold tracking-tight text-lg">Settings</span>
        </div>
        {/* Invisible placeholder to balance the header (since Back is on the left) */}
        <div className="w-16" />
      </header>

      {/* Main Content */}
      <main className="max-w-2xl mx-auto w-full px-4 py-8 flex flex-col gap-8">
        
        {/* User Account Section */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest pl-1">Account</h2>
          
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden divide-y divide-zinc-800/50">
            {/* User Profile */}
            <div className="p-4 sm:p-5 flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700/50">
                  <User className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-zinc-500 font-medium mb-0.5">Logged in as</p>
                  <p className="font-bold text-zinc-200 font-mono text-sm sm:text-base">
                    {authState?.user?.username || 'Loading...'}
                  </p>
                </div>
              </div>
            </div>

            {/* Logout Action */}
            <button
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group cursor-pointer text-left active:bg-zinc-800"
            >
              <div className="flex items-center gap-3 text-red-400 group-hover:text-red-300">
                <LogOut className="w-5 h-5" />
                <span className="font-bold text-sm">Sign Out</span>
              </div>
            </button>
          </div>
        </section>

        {/* Household Section */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest pl-1">Household</h2>

          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden divide-y divide-zinc-800/50">
            <div className="p-4 sm:p-5 flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                <Home className="w-5 h-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-zinc-500 font-medium mb-0.5">Household</p>
                <p className="font-bold text-zinc-200 text-sm sm:text-base truncate">
                  {householdLoading ? 'Loading...' : household?.name?.trim() || 'Unnamed household'}
                </p>
              </div>
            </div>

            {/* Members */}
            <div className="p-4 sm:p-5 space-y-2.5">
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                <Users className="w-3.5 h-3.5" />
                <span>{household ? `${household.members.length} member${household.members.length === 1 ? '' : 's'}` : 'Members'}</span>
              </div>
              {household?.members.length ? (
                <ul className="space-y-1.5">
                  {household.members.map((member) => (
                    <li key={member.id} className="flex items-center gap-2 text-sm">
                      <span className="font-bold text-zinc-200">
                        {member.displayName?.trim() || member.username}
                      </span>
                      {member.id === authState?.user?.id && (
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          You
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">No members loaded.</p>
              )}

              {editingName ? (
                <div className="space-y-2 pt-1">
                  <input
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="How your name should appear"
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500/60 rounded-xl px-4 py-3 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[48px]"
                  />

                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Gender</p>
                    <Segmented
                      name="Gender"
                      value={draftGender}
                      onChange={setDraftGender}
                      options={GENDER_OPTIONS}
                      accent="blue"
                    />
                    {draftGender === 'other' && (
                      <div className="space-y-2 pt-1">
                        <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                          How should we write about you?
                        </p>
                        <Segmented
                          name="Writing form"
                          value={draftForm}
                          onChange={setDraftForm}
                          options={FORM_OPTIONS}
                          accent="blue"
                        />
                      </div>
                    )}
                    <p className="text-xs leading-relaxed text-zinc-500">
                      Used to write outreach about you correctly in languages that inflect for
                      gender. Left blank, drafts word around it rather than guessing.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        memberMutation.mutate(
                          {
                            displayName: draftName,
                            gender: draftGender || undefined,
                            grammaticalForm:
                              draftGender === 'other' ? draftForm || undefined : undefined,
                          },
                          { onSuccess: () => setEditingName(false) }
                        )
                      }
                      disabled={memberMutation.isPending}
                      className="flex-1 min-h-[44px] rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                    >
                      {memberMutation.isPending ? 'Saving...' : 'Save name'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingName(false)}
                      className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm border border-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const me = household?.members.find((m) => m.id === authState?.user?.id);
                    setDraftName(me?.displayName?.trim() || '');
                    setDraftGender(me?.gender || '');
                    setDraftForm(me?.grammaticalForm || '');
                    setEditingName(true);
                  }}
                  className="text-xs text-blue-400 hover:text-blue-300 font-bold cursor-pointer min-h-[44px] flex items-center"
                >
                  Change how your name appears
                </button>
              )}
            </div>

            {/*
              Work is personal and changes — a contract ends, a visa comes through.
              It is edited on the same screen it was first asked on, so there is
              one implementation of the questions rather than two that can drift.
            */}
            <div className="p-4 sm:p-5 space-y-1.5 border-t border-zinc-800/60">
              <p className="text-xs text-zinc-500 font-medium">Your work</p>
              {(() => {
                const me = household?.members.find((m) => m.id === authState?.user?.id);
                const occupation = me?.workProfile?.occupation?.trim();
                return occupation ? (
                  <p className="font-bold text-zinc-200 text-sm break-words">{occupation}</p>
                ) : (
                  <p className="text-sm text-zinc-500">
                    {me?.workProfile?.employmentStatus
                      ? 'Answered, with no details added.'
                      : 'Not answered yet.'}
                  </p>
                );
              })()}
              <p className="text-xs leading-relaxed text-zinc-500">
                Yours alone. Messages for listings you entered are written in your voice; your
                partner's are written in theirs.
              </p>
              <Link
                href="/about-you"
                className="text-xs text-blue-400 hover:text-blue-300 font-bold cursor-pointer min-h-[44px] flex items-center"
              >
                Edit your work and the shared details
              </Link>
            </div>

            {/* Derived outreach signature */}
            <div className="p-4 sm:p-5 space-y-1.5">
              <p className="text-xs text-zinc-500 font-medium">Outreach is signed</p>
              {household?.signOff ? (
                <p className="font-bold text-zinc-200 text-sm sm:text-base break-words">{household.signOff}</p>
              ) : (
                <p className="text-sm text-amber-400/90">
                  No names set — drafts will end without a signature rather than invent one.
                </p>
              )}
              <p className="text-xs text-zinc-500 leading-relaxed">
                Built from everyone in the household, joined in your target language. Nothing
                to configure — change a name above and the signature follows.
              </p>
            </div>

            {/* Join code */}
            <div className="p-4 sm:p-5 space-y-3">
              <div>
                <p className="text-xs text-zinc-500 font-medium mb-1.5">Household code</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-lg sm:text-xl font-extrabold tracking-widest text-zinc-100 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 select-all break-all">
                    {household?.joinCode || '••••-••••'}
                  </code>
                  <button
                    type="button"
                    onClick={copyCode}
                    disabled={!household?.joinCode}
                    title="Copy household code"
                    className="w-11 h-11 min-w-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 flex items-center justify-center text-zinc-300 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-amber-400/90 leading-relaxed">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>
                  Anyone with this code can read and change your criteria, listings and
                  outreach. Share it directly with your partner, not anywhere public.
                </p>
              </div>

              {confirmRotate ? (
                <div className="space-y-2.5 pt-1">
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Generate a new code? The old one stops working immediately. Everyone
                    already in the household keeps their access.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        rotateMutation.mutate(undefined, { onSettled: () => setConfirmRotate(false) });
                      }}
                      disabled={rotateMutation.isPending}
                      className="flex-1 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                    >
                      {rotateMutation.isPending ? 'Generating...' : 'Generate new code'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRotate(false)}
                      className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm border border-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmRotate(true)}
                  className="w-full min-h-[44px] rounded-xl bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 font-bold text-sm border border-zinc-700/50 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Rotate code</span>
                </button>
              )}
            </div>

            {/* Join another household */}
            <div className="p-4 sm:p-5 space-y-3">
              {showJoin ? (
                <>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Entering another household&apos;s code moves this account into it. You will
                    see their criteria and listings instead of your own.
                  </p>
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="7F3K-92QX"
                    autoCapitalize="characters"
                    spellCheck={false}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500/60 rounded-xl px-4 py-3 text-[16px] sm:text-sm font-mono tracking-widest text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[48px]"
                  />
                  {joinMutation.isError && (
                    <p className="text-xs text-red-400">{joinMutation.error?.message}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => joinMutation.mutate(joinCode)}
                      disabled={joinMutation.isPending || joinCode.trim().length === 0}
                      className="flex-1 min-h-[44px] rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {joinMutation.isPending ? 'Joining...' : 'Join household'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowJoin(false);
                        setJoinCode('');
                        joinMutation.reset();
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm border border-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowJoin(true)}
                  className="w-full min-h-[44px] rounded-xl bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 font-bold text-sm border border-zinc-700/50 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <Home className="w-4 h-4" />
                  <span>Join a different household</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* AI & billing — whose key pays for the household's LLM usage */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest pl-1">
            AI &amp; billing
          </h2>

          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden divide-y divide-zinc-800/50">
            {/* Who is paying */}
            <div className="p-4 sm:p-5 flex items-center gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${
                  llm?.keySet
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : 'bg-amber-500/10 border-amber-500/20'
                }`}
              >
                <Sparkles
                  className={`w-5 h-5 ${llm?.keySet ? 'text-emerald-400' : 'text-amber-400'}`}
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-zinc-500 font-medium mb-0.5">Anthropic API key</p>
                <p className="font-bold text-zinc-200 text-sm sm:text-base truncate">
                  {householdLoading
                    ? 'Loading...'
                    : llm?.keySet
                      ? `Billing to ${payerLabel}`
                      : 'No key configured'}
                </p>
              </div>
            </div>

            {/* Offline state — the honest version of "the AI features look broken" */}
            {!householdLoading && !llm?.keySet && (
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-start gap-2.5 text-xs text-amber-400/90 leading-relaxed">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <p>
                    Listing analysis and outreach drafts are falling back to offline output.
                    Everything still works and nothing is invented — the drafts are just
                    assembled from your own answers instead of written.
                  </p>
                </div>
                {household?.envKeyAvailable && (
                  <button
                    type="button"
                    onClick={() => importEnvKeyMutation.mutate()}
                    disabled={importEnvKeyMutation.isPending}
                    className="w-full min-h-[44px] rounded-xl bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 font-bold text-sm border border-zinc-700/50 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {importEnvKeyMutation.isPending
                        ? 'Checking key...'
                        : "Use this server's configured key"}
                    </span>
                  </button>
                )}
                {importEnvKeyMutation.isError && (
                  <p className="text-xs text-red-400">{importEnvKeyMutation.error?.message}</p>
                )}
              </div>
            )}

            {/* The key itself */}
            <div className="p-4 sm:p-5 space-y-3">
              {llm?.keySet && !showKeyForm && (
                <div>
                  <p className="text-xs text-zinc-500 font-medium mb-1.5">Installed key</p>
                  <code className="block font-mono text-sm font-bold tracking-wider text-zinc-300 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3">
                    sk-ant-••••••••{llm.keyHint}
                  </code>
                </div>
              )}

              {showKeyForm ? (
                <>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {llm?.keySet
                      ? 'Replacing the key moves the household’s AI spend onto the new one. The old key stops being used immediately.'
                      : 'Paste a key from console.anthropic.com. Whoever adds it pays for everyone in the household.'}
                  </p>
                  <input
                    type="password"
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    placeholder="sk-ant-..."
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500/60 rounded-xl px-4 py-3 text-[16px] sm:text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[48px]"
                  />
                  {setKeyMutation.isError && (
                    <p className="text-xs text-red-400">{setKeyMutation.error?.message}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={submitKey}
                      disabled={setKeyMutation.isPending || keyDraft.trim().length === 0}
                      className="flex-1 min-h-[44px] rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {setKeyMutation.isPending ? 'Checking with Anthropic...' : 'Save key'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowKeyForm(false);
                        setKeyDraft('');
                        setKeyMutation.reset();
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm border border-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowKeyForm(true)}
                  className="w-full min-h-[44px] rounded-xl bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 font-bold text-sm border border-zinc-700/50 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>{llm?.keySet ? 'Replace key' : 'Add API key'}</span>
                </button>
              )}

              {llm?.keySet && !showKeyForm && (
                confirmRemoveKey ? (
                  <div className="space-y-2.5 pt-1">
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Remove the key? Listing analysis and outreach drafts drop to offline
                      output for everyone in the household until someone adds another.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          clearKeyMutation.mutate(undefined, {
                            onSettled: () => setConfirmRemoveKey(false),
                          })
                        }
                        disabled={clearKeyMutation.isPending}
                        className="flex-1 min-h-[44px] rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                      >
                        {clearKeyMutation.isPending ? 'Removing...' : 'Remove key'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveKey(false)}
                        className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm border border-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveKey(true)}
                    className="w-full min-h-[44px] rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Remove key</span>
                  </button>
                )
              )}
            </div>

            {/* Model — the cost lever, next to the person paying it */}
            <div className="p-4 sm:p-5 space-y-3">
              <div>
                <p className="text-xs text-zinc-500 font-medium mb-0.5">Model</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Applies to every AI feature in the household. Charged to the key above.
                </p>
              </div>

              {modelsLoading ? (
                <p className="text-xs text-zinc-500">Loading models from Anthropic...</p>
              ) : (
                <>
                  <div className="grid gap-2">
                    {visibleModels.map((model) => {
                      const active = llm?.model === model.id;
                      const context = formatContextWindow(model.contextWindow);
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => setModelMutation.mutate(model.id)}
                          disabled={setModelMutation.isPending || active}
                          className={`w-full min-h-[44px] text-left rounded-xl px-4 py-3 border transition-all duration-150 active:scale-[0.98] cursor-pointer disabled:cursor-default ${
                            active
                              ? 'bg-blue-500/10 border-blue-500/50'
                              : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`font-bold text-sm truncate ${active ? 'text-blue-300' : 'text-zinc-300'}`}
                            >
                              {model.displayName}
                            </span>
                            {/* Only when we have a published rate — never estimated. */}
                            {model.rate && (
                              <span className="text-xs font-mono text-zinc-500 shrink-0">
                                {model.rate}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-600 font-mono mt-0.5 truncate">
                            {model.id}
                            {context ? ` · ${context}` : ''}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {models.length > MODELS_SHOWN_COLLAPSED && (
                    <button
                      type="button"
                      onClick={() => setShowAllModels((v) => !v)}
                      className="w-full min-h-[44px] rounded-xl bg-zinc-800/70 hover:bg-zinc-800 text-zinc-400 font-bold text-xs border border-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      {showAllModels
                        ? 'Show fewer'
                        : `Show all ${models.length} available models`}
                    </button>
                  )}

                  <p className="text-xs text-zinc-500 leading-relaxed">
                    {catalogue?.source === 'live'
                      ? 'Read from Anthropic with your key, newest first — new models appear here on their own. Only models supporting the structured output this app relies on are listed.'
                      : 'Showing the built-in list. Add a key above to read the current models straight from Anthropic.'}
                  </p>
                </>
              )}

              {setModelMutation.isError && (
                <p className="text-xs text-red-400">{setModelMutation.error?.message}</p>
              )}
            </div>

            <div className="p-4 sm:p-5">
              <div className="flex items-start gap-2.5 text-xs text-zinc-500 leading-relaxed">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p>
                  The key is stored on this server and never sent to the browser. Anyone in
                  the household can replace it, and it is cleared automatically if the member
                  who added it leaves.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Archive */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest pl-1">Archive</h2>

          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden">
            {archiveLoading ? (
              <p className="p-4 sm:p-5 text-sm text-zinc-500">Loading archive...</p>
            ) : archived.length === 0 ? (
              <div className="p-4 sm:p-5 flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700/50 shrink-0">
                  <Archive className="w-5 h-5 text-zinc-400" />
                </div>
                <div>
                  <p className="font-bold text-zinc-200 text-sm sm:text-base">Nothing archived</p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    Deleting a listing from the dashboard moves it here rather than destroying
                    it, so you can bring it back.
                  </p>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-800/50">
                {archived.map((apt) => (
                  <li key={apt.id} className="p-4 sm:p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-zinc-200 text-sm break-words">{apt.title}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {apt.mcdaScore !== null && apt.mcdaScore !== undefined
                            ? `${apt.mcdaScore}% match`
                            : 'Not scored'}
                          {' · '}
                          {apt.currency} {apt.price}
                        </p>
                      </div>
                    </div>

                    {confirmPurgeId === apt.id ? (
                      <div className="space-y-2">
                        <p className="text-xs text-red-400 leading-relaxed">
                          Delete permanently? This also removes its conversation and cannot be
                          undone.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              purgeMutation.mutate(apt.id, { onSettled: () => setConfirmPurgeId(null) })
                            }
                            disabled={purgeMutation.isPending}
                            className="flex-1 min-h-[44px] rounded-xl bg-red-500 hover:bg-red-600 text-white font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                          >
                            {purgeMutation.isPending ? 'Deleting...' : 'Delete forever'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmPurgeId(null)}
                            className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm border border-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => restoreMutation.mutate(apt.id)}
                          disabled={restoreMutation.isPending}
                          className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-sm border border-zinc-700/50 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Restore</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmPurgeId(apt.id)}
                          title="Delete permanently"
                          className="w-11 min-w-[44px] min-h-[44px] rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Preferences Section */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest pl-1">Preferences</h2>
          
          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden">
            <Link href="/onboarding">
              <button className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group cursor-pointer text-left active:bg-zinc-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                    <Sparkles className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <p className="font-bold text-zinc-200 text-sm sm:text-base group-hover:text-white transition-colors">
                      Onboarding Wizard
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Update your must-have features and target rent
                    </p>
                  </div>
                </div>
              </button>
            </Link>

            {/* Sits under the wizard because changing your criteria is exactly
                when the stored scores stop matching them. */}
            <div className="border-t border-zinc-800/80">
              <button
                onClick={() => rescoreAll.mutate()}
                disabled={rescoreAll.isPending}
                className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-zinc-800/50 transition-colors group cursor-pointer text-left active:bg-zinc-800 disabled:opacity-60 disabled:cursor-wait"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                    {rescoreAll.isPending ? (
                      <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                    ) : (
                      <Calculator className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-200 text-sm sm:text-base group-hover:text-white transition-colors">
                      {rescoreAll.isPending ? 'Re-scoring…' : 'Re-score every listing'}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                      Runs the maths again on what you already entered. Costs nothing and
                      changes nothing else — your ratings, notes, threads and pipeline
                      stages are untouched.
                    </p>
                  </div>
                </div>
              </button>

              {/* Reported rather than assumed: the useful answer is how many
                  actually moved, and "none" is a real and common result. */}
              {rescoreAll.isSuccess && !rescoreAll.isPending && (
                <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
                  <p className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5 leading-relaxed">
                    Re-scored {rescoreAll.data.rescored}{' '}
                    {rescoreAll.data.rescored === 1 ? 'listing' : 'listings'}
                    {rescoreAll.data.archived > 0 && `, ${rescoreAll.data.archived} of them archived`}
                    .{' '}
                    {rescoreAll.data.scoreChanged === 0
                      ? 'No score changed — they already matched your current criteria.'
                      : `${rescoreAll.data.scoreChanged} ${
                          rescoreAll.data.scoreChanged === 1 ? 'score' : 'scores'
                        } changed${
                          rescoreAll.data.statusChanged > 0
                            ? `, and ${rescoreAll.data.statusChanged} moved between qualified and fell-short.`
                            : '.'
                        }`}
                    {rescoreAll.data.failed > 0 && ` ${rescoreAll.data.failed} could not be scored.`}
                  </p>
                </div>
              )}

              {rescoreAll.isError && (
                <div className="px-4 sm:px-5 pb-4 sm:pb-5 -mt-1">
                  <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5 leading-relaxed">
                    {(rescoreAll.error as Error).message}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
