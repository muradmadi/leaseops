/**
 * Who this listing's messages are written as.
 *
 * The default is whoever entered the listing, which is right almost always. It
 * is not always right: partners log in on each other's phones, and one of them
 * often ends up writing to a landlord about a listing the other added. Then the
 * draft says "I" about the wrong person's job, which is the defect per-member
 * work exists to fix arriving by another door.
 *
 * Hidden in a one-member household, where there is no choice to make.
 *
 * Changing it does not rewrite messages already in the thread. Those are a
 * record of what was written — and possibly already sent — so the new voice
 * applies to the next draft or reply, and the copy says so.
 */
import { useState } from 'react';
import { PenLine, Check, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useHousehold, type HouseholdMember } from '../lib/useHousehold';
import { useSetApartmentAuthor } from '../lib/useApartments';

interface Props {
  apartmentId: string;
  /** The explicit override, or null when the listing follows its creator. */
  outreachAuthorId: string | null;
  /** Who entered the listing. Null on rows that predate the column. */
  createdBy: string | null;
}

function memberLabel(member: HouseholdMember): string {
  return member.displayName?.trim() || member.username;
}

export default function OutreachAuthorControl({ apartmentId, outreachAuthorId, createdBy }: Props) {
  const { data: household } = useHousehold();
  const { data: auth } = useAuth();
  const setAuthor = useSetApartmentAuthor();
  const [open, setOpen] = useState(false);

  const members = household?.members ?? [];
  if (members.length < 2) return null;

  // The same order the API resolves in, so the control cannot claim one thing
  // while the draft does another. Neither id matching a current member — a
  // listing from before the column, or an author who has left — resolves to the
  // oldest account, which is the first member.
  const resolved =
    members.find((m) => m.id === outreachAuthorId) ??
    members.find((m) => m.id === createdBy) ??
    members[0];

  const isOverridden = Boolean(outreachAuthorId);
  const isMe = resolved?.id === auth?.user?.id;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <span className="text-[11px] font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <PenLine className="w-3 h-3 text-blue-400 shrink-0" />
            Written as
          </span>
          <p className="text-sm font-extrabold text-zinc-100 truncate">
            {resolved ? memberLabel(resolved) : 'Nobody'}
            {isMe && <span className="text-zinc-500 font-medium"> (you)</span>}
          </p>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            {isOverridden
              ? 'Set by hand for this listing.'
              : createdBy
                ? 'Following whoever entered this listing.'
                : 'Entered before this app recorded who added a listing.'}{' '}
            Messages say “I” about them; everyone else is named for their own work.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((was) => !was)}
          className="shrink-0 min-h-[44px] px-3 rounded-xl text-xs font-bold text-blue-400 hover:text-blue-300 hover:bg-zinc-800/60 transition-all cursor-pointer active:scale-[0.98]"
        >
          {open ? 'Close' : 'Change'}
        </button>
      </div>

      {open && (
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            {members.map((member) => {
              const selected = resolved?.id === member.id;
              return (
                <button
                  key={member.id}
                  type="button"
                  disabled={setAuthor.isPending}
                  onClick={() =>
                    setAuthor.mutate(
                      { id: apartmentId, authorId: member.id },
                      { onSuccess: () => setOpen(false) }
                    )
                  }
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                    selected
                      ? 'bg-blue-500/15 border-blue-500/60 text-blue-300'
                      : 'bg-zinc-950/80 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  {setAuthor.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    selected && <Check className="w-3.5 h-3.5" />
                  )}
                  {memberLabel(member)}
                </button>
              );
            })}
          </div>

          {isOverridden && (
            <button
              type="button"
              disabled={setAuthor.isPending}
              onClick={() =>
                setAuthor.mutate({ id: apartmentId, authorId: null }, { onSuccess: () => setOpen(false) })
              }
              className="text-[11px] font-bold text-zinc-500 hover:text-zinc-300 min-h-[44px] flex items-center cursor-pointer"
            >
              Clear, and follow whoever entered it
            </button>
          )}

          <p className="text-[11px] text-zinc-500 leading-relaxed">
            Messages already in the thread are left as they were written. This applies to the next
            draft or suggested reply — to redo an existing draft, reject it and draft again.
          </p>
          {setAuthor.isError && (
            <p className="text-[11px] text-red-400">{(setAuthor.error as Error).message}</p>
          )}
        </div>
      )}
    </div>
  );
}
