import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export interface AuthState {
  authenticated: boolean;
  user?: { username: string };
}

export function useAuth() {
  return useQuery<AuthState, Error>({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<AuthState>('/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (credentials: { username: string; password: string }) => {
      const res = await apiFetch<{ success: boolean; user: { username: string }; token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials),
      });
      if (typeof window !== 'undefined' && res.token) {
        localStorage.setItem('leaseops_token', res.token);
      }
      return res;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], { authenticated: true, user: data.user });
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
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
