import { QueryClient } from '@tanstack/react-query';

/**
 * Singleton QueryClient instance configured with production-ready defaults.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes default freshness
      gcTime: 1000 * 60 * 30,   // 30 minutes garbage collection
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

/**
 * Query Key Factory Pattern
 * Guarantees type-safe, collision-free query cache keys across the entire frontend.
 */
export const apartmentKeys = {
  all: ['apartments'] as const,
  lists: () => [...apartmentKeys.all, 'list'] as const,
  list: (status?: string) => [...apartmentKeys.lists(), { status }] as const,
  details: () => [...apartmentKeys.all, 'detail'] as const,
  detail: (id: string) => [...apartmentKeys.details(), id] as const,
  ratings: (id: string) => [...apartmentKeys.detail(id), 'ratings'] as const,
  communications: (id: string) => [...apartmentKeys.detail(id), 'communications'] as const,
};

export const profileKeys = {
  all: ['userProfile'] as const,
  current: () => [...profileKeys.all, 'current'] as const,
  weights: () => [...profileKeys.all, 'weights'] as const,
};
