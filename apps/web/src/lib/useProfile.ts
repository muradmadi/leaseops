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

export function useProfile() {
  return useQuery<ProfileData, Error>({
    queryKey: ['profiles', 'me'],
    queryFn: () => apiFetch<ProfileData>('/profiles/me'),
    staleTime: 5 * 60 * 1000, // 5 minutes
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
