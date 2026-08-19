/**
 * A member's picture, which is not a picture.
 *
 * LeaseOps stores no images and uploads none: an avatar is the first letter of
 * the display name over one of the `AVATAR_STYLES` treatments. That keeps the
 * database file the whole of the app's state — the property `docker/backup.sh`
 * and `docker/import-db.sh` both rely on — and costs one short string per user
 * instead of a blob store.
 *
 * The letter comes from the display name, falling back to the username, because
 * the name is what the household and the outreach signature use. With neither,
 * it renders a person glyph rather than a guessed initial.
 */

import { User } from 'lucide-react';
import type { AvatarStyle } from '@leaseops/db';

export type { AvatarStyle };

/**
 * Each style is a full class string rather than an interpolated colour name:
 * Tailwind scans source text, so `bg-${colour}-500/15` would produce a class
 * that exists in the markup and in no stylesheet.
 *
 * The list is written out here rather than imported from `AVATAR_STYLES`
 * because that is a runtime value, and importing one from `@leaseops/db` pulls
 * `bun:sqlite` into the browser bundle — the same reason `Segmented` spells out
 * its own options. `Record<AvatarStyle, …>` is what keeps the two in step: a
 * style added to or removed from the schema fails to typecheck here.
 */
const STYLES: Record<AvatarStyle, { ring: string; text: string; label: string }> = {
  emerald: {
    ring: 'bg-emerald-500/15 border-emerald-500/40',
    text: 'text-emerald-300',
    label: 'Emerald',
  },
  blue: { ring: 'bg-blue-500/15 border-blue-500/40', text: 'text-blue-300', label: 'Blue' },
  violet: { ring: 'bg-violet-500/15 border-violet-500/40', text: 'text-violet-300', label: 'Violet' },
  amber: { ring: 'bg-amber-500/15 border-amber-500/40', text: 'text-amber-300', label: 'Amber' },
  rose: { ring: 'bg-rose-500/15 border-rose-500/40', text: 'text-rose-300', label: 'Rose' },
  slate: { ring: 'bg-zinc-700/40 border-zinc-600/50', text: 'text-zinc-300', label: 'Slate' },
};

const AVATAR_STYLES = Object.keys(STYLES) as AvatarStyle[];

/** The styles in picker order, with their human labels. */
export const AVATAR_STYLE_OPTIONS = AVATAR_STYLES.map((value) => ({
  value,
  label: STYLES[value].label,
}));

const SIZES = {
  sm: 'w-8 h-8 rounded-lg text-xs',
  md: 'w-10 h-10 rounded-xl text-sm',
  lg: 'w-14 h-14 rounded-2xl text-lg',
} as const;

const GLYPH = { sm: 'w-3.5 h-3.5', md: 'w-5 h-5', lg: 'w-6 h-6' } as const;

/**
 * The style to draw when the member has never picked one.
 *
 * Derived from the user id so two people in a household are told apart on sight
 * before either has opened Settings. Deterministic, so it does not change under
 * them on the next render or the next device.
 */
export function resolveAvatarStyle(style: AvatarStyle | null | undefined, id: string): AvatarStyle {
  if (style) return style;
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.codePointAt(0)!) % 100_000;
  return AVATAR_STYLES[hash % AVATAR_STYLES.length];
}

/**
 * The letter shown. Uppercased for the display, but taken from the first
 * character of the trimmed name, so a name in any script keeps its own letter.
 */
export function initialFor(displayName?: string | null, username?: string | null): string {
  const source = displayName?.trim() || username?.trim() || '';
  return [...source][0]?.toUpperCase() ?? '';
}

interface AvatarProps {
  id: string;
  displayName?: string | null;
  username?: string | null;
  /** Null renders the id-derived style — see `resolveAvatarStyle`. */
  style?: AvatarStyle | null;
  size?: keyof typeof SIZES;
  className?: string;
}

export default function Avatar({
  id,
  displayName,
  username,
  style,
  size = 'md',
  className = '',
}: AvatarProps) {
  const resolved = STYLES[resolveAvatarStyle(style, id)];
  const initial = initialFor(displayName, username);
  return (
    <div
      aria-hidden="true"
      className={`${SIZES[size]} ${resolved.ring} ${resolved.text} shrink-0 border flex items-center justify-center font-extrabold select-none ${className}`}
    >
      {initial || <User className={GLYPH[size]} />}
    </div>
  );
}
