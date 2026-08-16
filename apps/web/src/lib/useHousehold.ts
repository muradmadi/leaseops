import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { Gender, GrammaticalForm, AnthropicModelId } from '@leaseops/db';

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

/**
 * Metadata about the household's Anthropic credential. The key itself never
 * leaves the server — only enough to recognise which one is installed and who
 * is paying for it.
 */
export interface HouseholdLlm {
  /** False means every AI feature is producing deterministic offline output. */
  keySet: boolean;
  /** Last four characters of the key. */
  keyHint: string | null;
  /** User id of the member whose key is being billed. */
  setBy: string | null;
  setAt: string | number | null;
  model: AnthropicModelId;
}

/** One model as offered in Settings, from Anthropic's Models API. */
export interface AvailableModel {
  id: AnthropicModelId;
  displayName: string;
  /** Null when there is no published rate for it — never a guessed one. */
  rate: string | null;
  contextWindow: number | null;
  releasedAt: string | null;
}

export interface ModelCatalogue {
  /** Newest first, as Anthropic returns them. */
  models: AvailableModel[];
  /** `fallback` means the built-in list: no key yet, or Anthropic unreachable. */
  source: 'live' | 'fallback';
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
  llm: HouseholdLlm;
  /**
   * The server still has an `ANTHROPIC_API_KEY` in its environment, which is no
   * longer read at request time. Drives the one-click import offered on an
   * instance that predates per-household keys.
   */
  envKeyAvailable: boolean;
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

/** Everything the household routes return: the public row, never the API key. */
type PublicHousehold = Pick<HouseholdData, 'id' | 'name' | 'joinCode' | 'llm' | 'createdAt'>;

export function useRenameHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      apiFetch<PublicHousehold>('/households/me', {
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
      apiFetch<PublicHousehold>('/households/me/rotate-code', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['households', 'me'] });
    },
  });
}

/**
 * Installs the household's Anthropic key.
 *
 * The API verifies it against Anthropic before saving, so a rejected key throws
 * here with the reason rather than saving and silently disabling every AI
 * feature.
 */
export function useSetLlmKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string) =>
      apiFetch<PublicHousehold>('/households/me/llm-key', {
        method: 'PUT',
        body: JSON.stringify({ apiKey }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['households', 'me'] });
    },
  });
}

/** Adopts the server's env key as the household's own. One-time migration path. */
export function useImportEnvLlmKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<PublicHousehold>('/households/me/llm-key/import-env', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['households', 'me'] });
    },
  });
}

/** Stops the household's AI spend. Every AI feature drops to offline output. */
export function useClearLlmKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<PublicHousehold>('/households/me/llm-key', { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['households', 'me'] });
    },
  });
}

export function useSetLlmModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (model: AnthropicModelId) =>
      apiFetch<PublicHousehold>('/households/me/llm-model', {
        method: 'PATCH',
        body: JSON.stringify({ model }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['households', 'me'] });
    },
  });
}

/**
 * The models the household's key can actually use, read live from Anthropic so a
 * newly released one appears without a code change.
 *
 * Cached for an hour to match the server's own cache — the catalogue only moves
 * when Anthropic ships a model, and Settings is opened far more often than that.
 */
export function useLlmModels() {
  return useQuery<ModelCatalogue, Error>({
    queryKey: ['households', 'me', 'llm-models'],
    queryFn: () => apiFetch<ModelCatalogue>('/households/me/llm-models'),
    staleTime: 60 * 60 * 1000,
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
      apiFetch<{
        success: boolean;
        household: PublicHousehold;
        abandonedHouseholdRemoved: boolean;
        /** True when your key stayed behind with the household you just left. */
        llmKeyCleared: boolean;
      }>('/households/join', { method: 'POST', body: JSON.stringify({ joinCode }) }),
    onSuccess: () => {
      queryClient.clear();
    },
  });
}
