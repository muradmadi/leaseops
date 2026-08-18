import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';

export interface ProfileData {
  exists: boolean;
  username?: string;
  targetLocation: string;
  targetLanguage: string;
  autoDraftMessages: boolean;
  currency: string;
  idealRent: number;
  maxRent: number;
  qualifyingThreshold: number;
  featureWeights: Record<string, number>;
  spaceRequirements: {
    floorSizeSqm?: { min?: number | null; max?: number | null };
    bedrooms?: { minimum?: number | null; ideal?: number | null };
    bathrooms?: { minimum?: number | null; ideal?: number | null };
  };
  tenantPersona: string;
}

/**
 * @param live Poll while a screen shares this row with the other member. The
 * work screen uses it so a partner's save shows up without a reload; nothing
 * else needs it, since the criteria only change when you change them.
 */
export function useProfile(live = false) {
  return useQuery<ProfileData, Error>({
    queryKey: ['profiles', 'me'],
    queryFn: () => apiFetch<ProfileData>('/profiles/me'),
    staleTime: live ? 0 : 5 * 60 * 1000,
    refetchInterval: live ? 10 * 1000 : false,
  });
}

/**
 * Saves the household's shared tenant facts on their own.
 *
 * Deliberately not `useUpdateProfile`: that sends the whole profile, and every
 * field of the API payload has a default, so a partial write there would reset
 * the location, the budget and all 32 feature weights.
 */
export function useUpdateHouseholdPersona() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tenantPersona: string) =>
      apiFetch<ProfileData>('/profiles/me/persona', {
        method: 'PATCH',
        body: JSON.stringify({ tenantPersona }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['profiles', 'me'], data);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<ProfileData>) => {
      return apiFetch<ProfileData>('/profiles/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    onMutate: async (newProfile) => {
      await queryClient.cancelQueries({ queryKey: ['profiles', 'me'] });
      const previousProfile = queryClient.getQueryData<ProfileData>(['profiles', 'me']);
      if (previousProfile) {
        queryClient.setQueryData<ProfileData>(['profiles', 'me'], {
          ...previousProfile,
          ...newProfile,
          exists: true,
        });
      }
      return { previousProfile };
    },
    onError: (_err, _newProfile, context) => {
      if (context?.previousProfile) {
        queryClient.setQueryData(['profiles', 'me'], context.previousProfile);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['profiles', 'me'], data);
    },
  });
}
