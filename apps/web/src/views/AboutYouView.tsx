/**
 * The work screen: mandatory once per account, and afterwards the place the
 * household's shared facts are edited.
 *
 * It exists because outreach used to be written from one unowned block of text.
 * Both partners share a pipeline, but each writes to landlords from their own
 * account on the portal, so a message entered by one of them was narrating the
 * other's job in the first person. Work is now per member; everything below the
 * divider is shared.
 *
 * Two independent saves, deliberately. The work block writes your own user row
 * and cannot collide with anyone. The shared block writes the household's one
 * profile row, so it is the only half that needs care — see the banner below.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Check, ArrowRight, Loader2, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useHousehold, useUpdateWorkProfile } from '../lib/useHousehold';
import { useProfile, useUpdateHouseholdPersona } from '../lib/useProfile';
import WorkProfileFields, {
  EMPTY_WORK_PROFILE,
  type WorkDraft,
  pruneToStatus,
} from '../components/WorkProfileFields';
import HouseholdPersonaFields from '../components/HouseholdPersonaFields';
import {
  parseHouseholdPersona,
  personasMatch,
  serialiseHouseholdPersona,
  EMPTY_HOUSEHOLD_PERSONA,
  type HouseholdPersona,
} from '../lib/persona';

interface Props {
  /** True when this account has never answered, which is what makes it mandatory. */
  required: boolean;
}

export default function AboutYouView({ required }: Props) {
  const [, setLocation] = useLocation();
  const { data: auth } = useAuth();
  const { data: household } = useHousehold();
  const { data: profile } = useProfile(true);
  const saveWork = useUpdateWorkProfile();
  const savePersona = useUpdateHouseholdPersona();

  const me = household?.members.find((member) => member.id === auth?.user?.id);
  const others = (household?.members || []).filter((member) => member.id !== auth?.user?.id);

  const [work, setWork] = useState<WorkDraft>(EMPTY_WORK_PROFILE);
  const [workLoaded, setWorkLoaded] = useState(false);
  const [persona, setPersona] = useState<HouseholdPersona>(EMPTY_HOUSEHOLD_PERSONA);
  const [personaTouched, setPersonaTouched] = useState(false);

  /**
   * What the server held when this form was filled from it. Compared against
   * later fetches to notice the other member saving while you type.
   */
  const personaBaseline = useRef<HouseholdPersona>(EMPTY_HOUSEHOLD_PERSONA);
  const [incoming, setIncoming] = useState<HouseholdPersona | null>(null);

  // Fill the work block once. Re-running it on every render of the query would
  // overwrite what the user is typing.
  useEffect(() => {
    if (workLoaded || !me) return;
    setWork({ ...EMPTY_WORK_PROFILE, ...(me.workProfile || {}), employmentStatus: me.workProfile?.employmentStatus || '' });
    setWorkLoaded(true);
  }, [me, workLoaded]);

  /**
   * Keep the shared block in step with the server, without ever mutating a field
   * under the cursor.
   *
   * Untouched, it simply follows — save it on one phone and it appears on the
   * other. Touched, an incoming change raises a banner instead: silently
   * replacing text someone is halfway through typing is the same data loss as
   * the last-write-wins it was meant to prevent.
   */
  useEffect(() => {
    if (!profile) return;
    const stored = parseHouseholdPersona(profile.tenantPersona);

    if (!personaTouched) {
      personaBaseline.current = stored;
      setPersona(stored);
      setIncoming(null);
      return;
    }

    if (!personasMatch(stored, personaBaseline.current)) setIncoming(stored);
  }, [profile, personaTouched]);

  const storedWork: WorkDraft = {
    ...EMPTY_WORK_PROFILE,
    ...(me?.workProfile || {}),
    employmentStatus: me?.workProfile?.employmentStatus || '',
  };
  const statusChosen = Boolean(work.employmentStatus);
  const workDirty = workLoaded && JSON.stringify(pruneToStatus(work)) !== JSON.stringify(storedWork);
  const workUnanswered = !me?.workProfile?.employmentStatus;

  const handleSaveWork = async () => {
    const pruned = pruneToStatus(work);
    if (!pruned.employmentStatus) return;
    setWork(pruned);
    await saveWork.mutateAsync({ ...pruned, employmentStatus: pruned.employmentStatus });
  };

  const handleSavePersona = async () => {
    const saved = await savePersona.mutateAsync(serialiseHouseholdPersona(persona));
    personaBaseline.current = parseHouseholdPersona(saved.tenantPersona);
    setPersonaTouched(false);
    setIncoming(null);
  };

  const handleDone = async () => {
    if (statusChosen && (workDirty || workUnanswered)) await handleSaveWork();
    if (personaTouched) await handleSavePersona();
    setLocation('/');
  };

  const waitingOn = others.filter((member) => !member.workProfile?.employmentStatus);

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-zinc-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-400">
      <header className="px-6 py-5 border-b border-zinc-900 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40">
        <span className="text-[11px] font-bold uppercase tracking-widest text-blue-400 block font-mono">
          {required ? 'One thing before you carry on' : 'Your details'}
        </span>
        <h1 className="text-xl font-extrabold text-zinc-100">About you and your household</h1>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-10">
        {required && (
          <p className="text-sm text-zinc-400 leading-relaxed bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4">
            Landlord messages are written in the voice of whoever entered the listing. Until you
            answer this, a message you send describes someone else's job — so this is asked once,
            per person.
          </p>
        )}

        <section className="space-y-5">
          <WorkProfileFields
            value={work}
            onChange={(next) => setWork(next)}
            name={me?.displayName || undefined}
          />

          {!required && (
            <button
              type="button"
              onClick={handleSaveWork}
              disabled={!statusChosen || saveWork.isPending}
              className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold px-6 py-3 rounded-xl text-sm transition-all min-h-[44px] flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              {saveWork.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Save my work details
            </button>
          )}
          {saveWork.isError && (
            <p className="text-xs text-red-400">{(saveWork.error as Error).message}</p>
          )}
        </section>

        <div className="border-t border-zinc-800 pt-8 space-y-2">
          <h2 className="text-sm font-extrabold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            Shared with the household
          </h2>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            These go into both of your messages, so write them so they stay true whoever is sending
            — “Murad's parents can act as guarantors”, not “my parents”.
            {others.length > 0 && ` ${others.map((m) => m.displayName || m.username).join(' and ')} sees the same boxes.`}
          </p>
        </div>

        {incoming && (
          <div className="bg-amber-500/10 border border-amber-500/40 rounded-2xl p-4 space-y-3">
            <p className="text-xs text-amber-200 leading-relaxed">
              Someone else in the household saved these shared details while you were typing. Your
              version is still on screen and has not been overwritten.
            </p>
            <button
              type="button"
              onClick={() => {
                setPersona(incoming);
                personaBaseline.current = incoming;
                setPersonaTouched(false);
                setIncoming(null);
              }}
              className="text-xs font-bold text-amber-300 flex items-center gap-1.5 min-h-[44px]"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Load their version instead
            </button>
          </div>
        )}

        <HouseholdPersonaFields
          value={persona}
          onChange={(next) => {
            setPersonaTouched(true);
            setPersona(next);
          }}
        />

        {waitingOn.length > 0 && (
          <p className="text-[11px] text-zinc-500">
            {waitingOn.map((m) => m.displayName || m.username).join(' and ')} has not added their
            work yet. Messages will name yours and leave theirs out until they do — nothing is
            guessed on their behalf.
          </p>
        )}

        <div className="sticky bottom-0 bg-zinc-950/95 backdrop-blur-md py-4 border-t border-zinc-900 space-y-2">
          <button
            type="button"
            onClick={handleDone}
            disabled={!statusChosen || saveWork.isPending || savePersona.isPending}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold px-6 py-3.5 rounded-xl text-sm transition-all min-h-[44px] flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {saveWork.isPending || savePersona.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            {required ? 'Save and continue' : 'Save and close'}
          </button>
          {!statusChosen && (
            <p className="text-[11px] text-zinc-500 text-center">
              Pick your situation above to continue. There is an option for every case, including
              not working.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
