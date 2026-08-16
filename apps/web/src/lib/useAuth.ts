import type { Gender, GrammaticalForm } from '@leaseops/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  householdId: string;
}

export interface AuthHousehold {
  id: string;
  name: string;
}

export interface AuthState {
  authenticated: boolean;
  user?: AuthUser;
  household?: AuthHousehold;
  /**
   * True only on an instance with no accounts at all, where a database from
   * another instance may still be adopted. It closes permanently the moment
   * any account exists, so the login screen must not cache this across a
   * successful sign-up.
   */
  canImport?: boolean;
}

export interface LoginPayload {
  username: string;
  password: string;
}

/**
 * Signup either starts a household or joins one with its code — the two paths
 * are mutually exclusive, mirroring the API's discriminated union.
 */
/** Asked at signup; optional, and never inferred from the name if skipped. */
interface Identity {
  gender?: Gender;
  /** Only meaningful with gender 'other'; derived otherwise. */
  grammaticalForm?: GrammaticalForm;
}

export type SignupPayload =
  | ({ mode: 'create'; username: string; password: string; displayName?: string; householdName?: string } & Identity)
  | ({ mode: 'join'; username: string; password: string; displayName?: string; joinCode: string } & Identity);

interface AuthSuccess {
  success: boolean;
  user: AuthUser;
  household: AuthHousehold & { joinCode: string };
  token: string;
}

export function useAuth() {
  return useQuery<AuthState, Error>({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<AuthState>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

function persistToken(res: AuthSuccess) {
  if (typeof window !== 'undefined' && res.token) {
    localStorage.setItem('leaseops_token', res.token);
  }
  return res;
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: LoginPayload) =>
      persistToken(
        await apiFetch<AuthSuccess>('/auth/login', {
          method: 'POST',
          body: JSON.stringify(credentials),
        })
      ),
    onSuccess: (data) => {
      queryClient.setQueryData<AuthState>(['auth', 'me'], {
        authenticated: true,
        user: data.user,
        household: { id: data.household.id, name: data.household.name },
      });
      // The signed-in household owns a different pipeline and different criteria
      // than whatever was cached, so neither may be reused.
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['households'] });
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: SignupPayload) =>
      persistToken(
        await apiFetch<AuthSuccess>('/auth/signup', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      ),
    onSuccess: (data) => {
      queryClient.setQueryData<AuthState>(['auth', 'me'], {
        authenticated: true,
        user: data.user,
        household: { id: data.household.id, name: data.household.name },
      });
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['households'] });
    },
  });
}

/** What the server reports after adopting a database, keyed by table. */
export type ImportResult = Record<string, number>;

export interface ImportPreview {
  ok: boolean;
  counts: ImportResult;
  /** Shown so a person can recognise the database before replacing anything. */
  households: string[];
  accounts: string[];
}

/**
 * The upload: the database, plus its write-ahead log when there is one.
 *
 * The `-wal` is not optional detail. SQLite keeps recent writes there, so a
 * `.db` copied while the app is running can be an old snapshot — structurally
 * perfect and quietly wrong.
 */
function importForm({ database, wal }: { database: File; wal?: File | null }) {
  const form = new FormData();
  form.append('database', database);
  if (wal) form.append('wal', wal);
  return form;
}

/**
 * Reads the uploaded database and reports what is in it, changing nothing.
 * Always run before {@link useImportDatabase} — it is the only step that can
 * catch a stale or simply wrong file, because a human reads the result.
 */
export function useInspectDatabase() {
  return useMutation({
    mutationFn: (files: { database: File; wal?: File | null }) =>
      apiFetch<ImportPreview>('/auth/import/inspect', { method: 'POST', body: importForm(files) }),
  });
}

/**
 * Uploads an existing instance's database file to a brand-new instance.
 *
 * Only usable while no account exists — see `canImport`. Nothing is persisted
 * client-side on success: the caller signs in afterwards with the credentials
 * that came across in the file, which are the ones they already had.
 */
export function useImportDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (files: { database: File; wal?: File | null }) =>
      apiFetch<{ success: boolean; imported: ImportResult }>('/auth/import', {
        method: 'POST',
        body: importForm(files),
      }),
    onSuccess: () => {
      // The instance now has accounts, so `canImport` has flipped and every
      // cached view of "this is an empty install" is wrong.
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' }).catch(() => {});
      if (typeof window !== 'undefined') {
        localStorage.removeItem('leaseops_token');
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(['auth', 'me'], { authenticated: false });
      queryClient.clear();
    },
  });
}
