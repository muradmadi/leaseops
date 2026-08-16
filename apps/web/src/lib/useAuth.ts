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
