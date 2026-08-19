import React, { useState } from 'react';
import Segmented, {
  GENDER_OPTIONS,
  FORM_OPTIONS,
  type Gender,
  type GrammaticalForm,
} from '../components/Segmented';
import Avatar, { AVATAR_STYLE_OPTIONS, type AvatarStyle } from '../components/Avatar';
import { Link } from 'wouter';
import {
  ArrowLeft,
  UserRound,
  LogOut,
  Sparkles,
  Settings,
  Home,
  Copy,
  Check,
  RefreshCw,
  Users,
  Pencil,
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
  useRenameHousehold,
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
  const renameMutation = useRenameHousehold();
  const memberMutation = useUpdateMember();
  const [draftGender, setDraftGender] = useState<Gender | ''>('');
  const [draftForm, setDraftForm] = useState<GrammaticalForm | ''>('');
  const [draftStyle, setDraftStyle] = useState<AvatarStyle | ''>('');
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
  const [editingHouseholdName, setEditingHouseholdName] = useState(false);
  const [draftHouseholdName, setDraftHouseholdName] = useState('');
  /**
   * What the join actually did, kept here rather than read off the mutation.
   *
   * Joining clears the whole query cache, so the mutation itself is not a
   * reliable place to read from afterwards — and this is the one report the user
   * cannot reconstruct by looking around: the household they left is gone from
   * their view by the time they would want to check on it.
   */
  const [joinResult, setJoinResult] = useState<{
    llmKeyCleared: boolean;
    abandonedHouseholdRemoved: boolean;
  } | null>(null);

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
  /** Your own membership row — the name, gender and style the editor works on. */
  const me = household?.members.find((m) => m.id === authState?.user?.id);

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
            {/*
              You, as the household sees you. The display name leads and the
              username is the small print beneath it: the name is what members
              read, what outreach is signed with, and what the monogram takes its
              letter from, while the username is only how you sign in.

              These questions used to live under Household, behind a link, which
              is the wrong place — they are answers about a person, not about the
              flat-hunt they share.
            */}
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-3.5">
                <Avatar
                  id={authState?.user?.id ?? ''}
                  displayName={me?.displayName ?? authState?.user?.displayName}
                  username={authState?.user?.username}
                  style={me?.avatarStyle}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="font-bold text-zinc-100 text-base sm:text-lg truncate">
                    {me?.displayName?.trim() ||
                      authState?.user?.displayName?.trim() || (
                        <span className="text-zinc-500 font-semibold">No name set</span>
                      )}
                  </p>
                  <p className="text-xs text-zinc-500 font-mono truncate">
                    {authState?.user?.username ? `@${authState.user.username}` : 'Loading...'}
                  </p>
                </div>
              </div>

              {editingName ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="displayName"
                      className="block text-xs font-bold uppercase tracking-wider text-zinc-400"
                    >
                      Name
                    </label>
                    <input
                      id="displayName"
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      placeholder="How your name should appear"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500/60 rounded-xl px-4 py-3 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[48px]"
                    />
                  </div>

                  {/*
                    The picture is the first letter of the name above, so the
                    swatches preview the real thing rather than a sample — change
                    the name and every swatch changes with it.
                  */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">Picture</p>
                    <div className="flex flex-wrap gap-2">
                      {AVATAR_STYLE_OPTIONS.map((option) => {
                        const selected = draftStyle === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            aria-label={option.label}
                            aria-pressed={selected}
                            onClick={() => setDraftStyle(option.value)}
                            className={`p-1 rounded-2xl border transition-all cursor-pointer ${
                              selected
                                ? 'border-blue-500/60 bg-blue-500/10'
                                : 'border-transparent hover:border-zinc-700'
                            }`}
                          >
                            <Avatar
                              id={authState?.user?.id ?? ''}
                              displayName={draftName}
                              username={authState?.user?.username}
                              style={option.value}
                            />
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs leading-relaxed text-zinc-500">
                      LeaseOps stores no photos. Your picture is your initial — pick the colour
                      you want it in.
                    </p>
                  </div>

                  <div className="space-y-2">
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
                            avatarStyle: draftStyle || undefined,
                          },
                          { onSuccess: () => setEditingName(false) }
                        )
                      }
                      disabled={memberMutation.isPending}
                      className="flex-1 min-h-[44px] rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                    >
                      {memberMutation.isPending ? 'Saving...' : 'Save'}
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
                    setDraftName(me?.displayName?.trim() || '');
                    setDraftGender(me?.gender || '');
                    setDraftForm(me?.grammaticalForm || '');
                    // Blank rather than the derived fallback: nothing is
                    // preselected until you actually choose, matching how the
                    // gender control treats an unanswered question.
                    setDraftStyle(me?.avatarStyle || '');
                    setEditingName(true);
                  }}
                  disabled={!household}
                  className="text-xs text-blue-400 hover:text-blue-300 font-bold cursor-pointer min-h-[44px] flex items-center disabled:opacity-50"
                >
                  Edit name, picture and gender
                </button>
              )}
            </div>

            {/*
              Your work, on the card about you.

              It is `users.workProfile` — the one part of the tenant story that
              belongs to a person rather than to the household — so it sits with
              the name and the gender that are also yours, not under the join
              code. The link goes to the same screen the gate first asked on, so
              there is one implementation of the questions rather than two.
            */}
            <Link href="/profile">
              <button className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group cursor-pointer text-left active:bg-zinc-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                    <UserRound className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-200 text-sm sm:text-base group-hover:text-white transition-colors">
                      Edit your profile
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                      Your job, contract, income and right to work. Yours alone — your partner
                      answers it for themselves.
                    </p>
                  </div>
                </div>
              </button>
            </Link>

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

        {/*
          Household Section — what the group is, who is in it, and how someone
          gets in. Everything personal now lives on the Account card above: the
          work summary that used to sit here was `users.workProfile`, which is
          the one part of the tenant story a household does not share.
        */}
        <section className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest pl-1">Household</h2>

          <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl overflow-hidden divide-y divide-zinc-800/50">
            {/*
              The name, and — new — a way to change it. The route and the hook
              have both existed since the household was first written; nothing
              called them, so a household created without a name at signup, where
              the field is optional, read "Unnamed household" permanently.
            */}
            <div className="p-4 sm:p-5">
              {editingHouseholdName ? (
                <div className="space-y-3">
                  <label
                    htmlFor="householdName"
                    className="block text-xs font-bold uppercase tracking-wider text-zinc-400"
                  >
                    Household name
                  </label>
                  <input
                    id="householdName"
                    type="text"
                    value={draftHouseholdName}
                    onChange={(e) => setDraftHouseholdName(e.target.value)}
                    placeholder="The Madi household"
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500/60 rounded-xl px-4 py-3 text-[16px] sm:text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all min-h-[48px]"
                  />
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Yours alone to recognise this search by. It is never sent to a landlord —
                    messages are signed with the members' names.
                  </p>
                  {renameMutation.isError && (
                    <p className="text-xs text-red-400">{(renameMutation.error as Error).message}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        renameMutation.mutate(draftHouseholdName, {
                          onSuccess: () => setEditingHouseholdName(false),
                        })
                      }
                      disabled={renameMutation.isPending}
                      className="flex-1 min-h-[44px] rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
                    >
                      {renameMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingHouseholdName(false);
                        renameMutation.reset();
                      }}
                      className="flex-1 min-h-[44px] rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-sm border border-zinc-700/50 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                    <Home className="w-6 h-6 text-blue-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-zinc-100 text-base sm:text-lg truncate">
                      {householdLoading ? (
                        'Loading...'
                      ) : (
                        household?.name?.trim() || (
                          <span className="text-zinc-500 font-semibold">Unnamed household</span>
                        )
                      )}
                    </p>
                    {/* The member count belongs here rather than as a heading over
                        the list below — it is a fact about the household, and it
                        stops the eyebrow above repeating the section title. */}
                    <p className="text-xs text-zinc-500">
                      {household
                        ? `${household.members.length} member${household.members.length === 1 ? '' : 's'}`
                        : 'Loading members...'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftHouseholdName(household?.name?.trim() || '');
                      renameMutation.reset();
                      setEditingHouseholdName(true);
                    }}
                    disabled={!household}
                    title="Rename household"
                    aria-label="Rename household"
                    className="w-11 h-11 min-w-[44px] rounded-xl bg-zinc-800/70 hover:bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 shrink-0"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/*
              Members, and the signature underneath them rather than in a panel
              of its own: the sign-off is built from exactly these names, so the
              two belong within sight of each other.
            */}
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
                <Users className="w-3.5 h-3.5" />
                <span>Members</span>
              </div>
              {household?.members.length ? (
                <ul className="space-y-2">
                  {household.members.map((member) => (
                    <li key={member.id} className="flex items-center gap-2.5 text-sm">
                      <Avatar
                        id={member.id}
                        displayName={member.displayName}
                        username={member.username}
                        style={member.avatarStyle}
                        size="sm"
                      />
                      <span className="font-bold text-zinc-200 truncate">
                        {member.displayName?.trim() || member.username}
                      </span>
                      {member.id === authState?.user?.id && (
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                          You
                        </span>
                      )}
                      {member.id === llm?.setBy && llm?.keySet && (
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-300 bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 rounded-full shrink-0">
                          Pays
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">No members loaded.</p>
              )}

              <div className="pt-1 border-t border-zinc-800/50 space-y-1">
                <p className="text-xs text-zinc-500 font-medium pt-2">Outreach is signed</p>
                {household?.signOff ? (
                  <p className="font-bold text-zinc-200 text-sm break-words">{household.signOff}</p>
                ) : (
                  <p className="text-sm text-amber-400/90">
                    No names set — drafts will end without a signature rather than invent one.
                  </p>
                )}
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Built from the names above, joined in your target language. Nothing to
                  configure.
                </p>
              </div>
            </div>

            {/*
              The household's half of the tenant story, on the household's card —
              the mirror of "Edit your profile" sitting under Account. Separate
              rows because the saves are separate: yours writes your user row,
              this one writes the shared profile a partner may be editing too.
            */}
            <Link href="/household">
              <button className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-zinc-800/50 transition-colors group cursor-pointer text-left active:bg-zinc-800">
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                    <Home className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-200 text-sm sm:text-base group-hover:text-white transition-colors">
                      Edit household profile
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                      Who is moving in, guarantees, documents, dates and pets. Shared, and
                      written into both of your messages.
                    </p>
                  </div>
                </div>
              </button>
            </Link>

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

            {/*
              Leaving, which is what this is — a user belongs to exactly one
              household, so joining another is a move rather than an addition.
              It is the most consequential control on this screen and used to be
              a grey button identical to "Rotate code" above it.

              The two side effects were computed by the API, returned in the
              response and rendered nowhere. If you are the member paying, your
              key stays behind, and the first sign of it would have been AI
              features quietly going offline for people you no longer share a
              household with. It is now said before, and reported after.
            */}
            <div className="p-4 sm:p-5 space-y-3">
              {joinResult && (
                <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5 leading-relaxed space-y-1">
                  <p className="font-bold">You are now in {household?.name?.trim() || 'the new household'}.</p>
                  {joinResult.llmKeyCleared && (
                    <p>
                      Your Anthropic key did not come with you — the household you left has
                      dropped to offline output rather than keep spending it.
                    </p>
                  )}
                  {joinResult.abandonedHouseholdRemoved && (
                    <p>
                      Your old household had no criteria and no listings, so it was removed.
                    </p>
                  )}
                  {!joinResult.llmKeyCleared && !joinResult.abandonedHouseholdRemoved && (
                    <p>Your old household is untouched, and its code still works.</p>
                  )}
                </div>
              )}

              {showJoin ? (
                <>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Entering another household&apos;s code moves this account into it. You will
                    see their criteria and listings instead of your own, and the ones here stay
                    behind with whoever is left.
                  </p>
                  {payerIsMe && (
                    <div className="flex items-start gap-2.5 text-xs text-amber-400/90 leading-relaxed">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <p>
                        This household runs on your key. Leaving takes it with you, and everyone
                        still here drops to offline output.
                      </p>
                    </div>
                  )}
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
                      onClick={() =>
                        joinMutation.mutate(joinCode, {
                          // Read here rather than off the mutation: joining clears
                          // the whole query cache, and this is the only account of
                          // what happened to the household being left.
                          onSuccess: (result) => {
                            setJoinResult({
                              llmKeyCleared: result.llmKeyCleared,
                              abandonedHouseholdRemoved: result.abandonedHouseholdRemoved,
                            });
                            setShowJoin(false);
                            setJoinCode('');
                          },
                        })
                      }
                      disabled={joinMutation.isPending || joinCode.trim().length === 0}
                      className="flex-1 min-h-[44px] rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {joinMutation.isPending ? 'Joining...' : 'Leave and join'}
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
                  onClick={() => {
                    setJoinResult(null);
                    setShowJoin(true);
                  }}
                  className="w-full min-h-[44px] rounded-xl bg-zinc-900 hover:bg-amber-500/10 text-amber-400/90 hover:text-amber-300 font-bold text-sm border border-amber-500/20 hover:border-amber-500/40 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Leave for a different household</span>
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
