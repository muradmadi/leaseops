import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { Gender, GrammaticalForm } from '@leaseops/db';

export interface HouseholdMember {
  id: string;
  username: string;
  displayName: string;
  /** Null for accounts created before the question existed, or skipped. */
  gender: Gender | null;
  grammaticalForm: GrammaticalForm | null;
  createdAt: string | number;
}

export interface MemberUpdate {
  displayName: string;
  gender?: Gender;
  grammaticalForm?: GrammaticalForm;
}

export interface HouseholdData {
  id: string;
  name: string;
  /** The shareable code. Treat as a secret: it grants full access to the household. */
  joinCode: string;
  members: HouseholdMember[];
  /**
   * How outreach will be signed, derived server-side from the members' names in
   * the target language. Display only — the draft rebuilds it at send time.
   */
  signOff: string;
  createdAt: string | number;
}

/**
 * @param language Preview the sign-off in a language the user has picked but not
 * yet saved. Omit to use the household's saved target language.
 */
export function useHousehold(language?: string) {
  const suffix = language ? `?language=${encodeURIComponent(language)}` : '';
  return useQuery<HouseholdData, Error>({
    queryKey: ['households', 'me', language ?? null],
    queryFn: () => apiFetch<HouseholdData>(`/households/me${suffix}`),
    staleTime: 60 * 1000,
  });
}

/**
 * Changes your own member record — the name the household sees, how drafts sign,
 * and the grammatical form outreach is written in.
 */
export function useUpdateMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: MemberUpdate) =>
      apiFetch<{ id: string; displayName: string }>('/households/me/member', {
        method: 'PATCH',
        body: JSON.stringify(update),
      }),
    onSuccess: () => {
      // The sign-off is derived from these names, so its preview is now stale.
      queryClient.invalidateQueries({ queryKey: ['households', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useRenameHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ id: string; name: string; joinCode: string }>('/households/me', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['households', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

/** Issues a new code and invalidates the old one. Members keep their access. */
export function useRotateJoinCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; name: string; joinCode: string }>('/households/me/rotate-code', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['households', 'me'] });
    },
  });
}

/**
 * Moves the signed-in user into another household. Everything they can see
 * changes, so the whole cache is dropped rather than selectively invalidated.
 */
export function useJoinHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (joinCode: string) =>
      apiFetch<{ success: boolean; household: { id: string; name: string }; abandonedHouseholdRemoved: boolean }>(
        '/households/join',
        { method: 'POST', body: JSON.stringify({ joinCode }) }
      ),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
