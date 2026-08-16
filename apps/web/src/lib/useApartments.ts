import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api';
import type { Apartment, PipelineStage } from '@leaseops/db';

/**
 * Custom TanStack Query hook to fetch all apartment listings.
 * Automatically polls every 3 seconds to reflect background scraping/enrichment updates.
 */
export function useApartments() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const eventSource = new EventSource('/api/apartments/sse');
    eventSource.addEventListener('update', () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
    });
    return () => eventSource.close();
  }, [queryClient]);

  return useQuery<Apartment[], Error>({
    queryKey: ['apartments'],
    queryFn: () => apiFetch<Apartment[]>('/apartments'),
  });
}

/**
 * Custom hook to fetch a single apartment listing by ID.
 */
export function useApartment(id: string) {
  return useQuery<Apartment, Error>({
    queryKey: ['apartments', id],
    queryFn: () => apiFetch<Apartment>(`/apartments/${id}`),
    enabled: !!id,
    refetchInterval: 3000,
  });
}

/**
 * Custom hook to ingest a new apartment listing with optional user feature grades and room ratings.
 */
export function useCreateApartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      /** Reference link only — the API never fetches it. */
      url?: string;
      title: string;
      price: number;
      currency?: string;
      description?: string;
      floorSizeSqm?: number | null;
      totalRooms?: number | null;
      bathrooms?: number | null;
      floorLevel?: string;
      neighborhood?: string;
      city?: string;
      featureRatings?: Record<string, number>;
      roomScores?: Record<string, number>;
    }) => {
      return apiFetch<Apartment>('/apartments', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
    },
  });
}

/** The archive — soft-deleted listings, surfaced in Settings. */
export function useArchivedApartments() {
  return useQuery<Apartment[], Error>({
    queryKey: ['apartments', 'archived'],
    queryFn: () => apiFetch<Apartment[]>('/apartments/archived'),
    staleTime: 30 * 1000,
  });
}

export function useRestoreApartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Apartment>(`/apartments/${id}/restore`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
    },
  });
}

/** Destroys a listing and its conversation. Only offered from the archive. */
export function usePermanentlyDeleteApartment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ success: boolean }>(`/apartments/${id}/permanent`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
    },
  });
}

/**
 * Marks a listing as pursued, or stops pursuing it.
 *
 * Activating a listing that fell short releases the AI review and outreach draft
 * the pipeline withheld. It does not change the listing's bucket — the score
 * decides that, and choosing to chase a flat does not make it qualify.
 */
export function useSetApartmentActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiFetch<Apartment>(`/apartments/${id}/active`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['apartments', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['messages', variables.id] });
    },
  });
}

/**
 * Edits a listing in full and re-scores it.
 *
 * The score is expected to move on save — that is the reason this exists. The AI
 * review is deliberately not regenerated; it is released on demand by Activate
 * so a typo fix does not cost a call.
 */
export function useUpdateApartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      apiFetch<Apartment>(`/apartments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['apartments', variables.id] });
    },
  });
}

/**
 * Pulls a qualifying listing into the yellow zone with a written reason, or
 * clears that override by passing `null`.
 *
 * The score is untouched. A listing keeps its percentage and its QUALIFIED
 * status — the demotion is your judgement recorded alongside the measurement,
 * not a rewrite of it.
 */
export function useSetApartmentAside() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string | null }) =>
      apiFetch<Apartment>(`/apartments/${id}/set-aside`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['apartments', variables.id] });
    },
  });
}

/**
 * Moves a listing along the outreach pipeline.
 *
 * Set by hand only. Nothing in the app advances it, so it stays a record of what
 * you actually did rather than what the app assumes you did.
 */
export function useSetApartmentStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, pipelineStage }: { id: string; pipelineStage: PipelineStage }) =>
      apiFetch<Apartment>(`/apartments/${id}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ pipelineStage }),
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['apartments', variables.id] });
    },
  });
}

/**
 * Custom hook to update an apartment's feature ratings and room scores post-viewing.
 */
export function useUpdateApartmentRatings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      featureRatings,
      roomScores,
    }: {
      id: string;
      featureRatings?: Record<string, number>;
      roomScores?: Record<string, number>;
    }) => {
      return apiFetch<Apartment>(`/apartments/${id}/ratings`, {
        method: 'PATCH',
        body: JSON.stringify({ featureRatings, roomScores }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
      queryClient.invalidateQueries({ queryKey: ['apartments', variables.id] });
    },
  });
}

/**
 * Custom hook to update an apartment's pipeline status with optimistic UI updates.
 */
export function useUpdateApartmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Apartment['status'] }) => {
      return apiFetch<Apartment>(`/apartments/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['apartments'] });
      const previousApartments = queryClient.getQueryData<Apartment[]>(['apartments']);

      if (previousApartments) {
        queryClient.setQueryData<Apartment[]>(
          ['apartments'],
          previousApartments.map((apt) => (apt.id === id ? { ...apt, status } : apt))
        );
      }

      return { previousApartments };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousApartments) {
        queryClient.setQueryData(['apartments'], context.previousApartments);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
    },
  });
}

/**
 * Custom hook to delete an apartment listing.
 */
export function useDeleteApartment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return apiFetch<{ success: boolean; id: string }>(`/apartments/${id}`, {
        method: 'DELETE',
      });
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['apartments'] });
      const previousApartments = queryClient.getQueryData<Apartment[]>(['apartments']);

      if (previousApartments) {
        queryClient.setQueryData<Apartment[]>(
          ['apartments'],
          previousApartments.filter((apt) => apt.id !== id)
        );
      }

      return { previousApartments };
    },
    onError: (_err, _id, context) => {
      if (context?.previousApartments) {
        queryClient.setQueryData(['apartments'], context.previousApartments);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['apartments'] });
    },
  });
}

/**
 * Custom hook to fetch the DeepSeek AI Pros/Cons review for an apartment.
 */
export function useAiReview(id: string) {
  return useQuery<any, Error>({
    queryKey: ['apartments', id, 'ai-review'],
    queryFn: () => apiFetch<any>(`/apartments/${id}/ai-review`),
    enabled: !!id,
    staleTime: 60 * 1000 * 5, // 5 minutes
  });
}

/**
 * Custom hook to force generation of a new DeepSeek AI Pros/Cons review.
 */
export function useGenerateAiReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return apiFetch<any>(`/apartments/${id}/ai-review`, {
        method: 'POST',
      });
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['apartments', id, 'ai-review'] });
    },
  });
}

/**
 * Custom hook to fetch or generate messages for an apartment's chat view.
 */
export function useMessages(id: string) {
  return useQuery<any[], Error>({
    queryKey: ['apartments', id, 'messages'],
    queryFn: () => apiFetch<any[]>(`/apartments/${id}/messages`),
    enabled: !!id,
    refetchInterval: 5000,
  });
}

/**
 * Custom hook to initialize the conversation by generating an AI outreach message.
 */
export function useInitMessages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      return apiFetch<any>(`/apartments/${id}/messages/init`, {
        method: 'POST',
      });
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['apartments', id, 'messages'] });
    },
  });
}

/**
 * Custom hook to log a new message to the chat view.
 */
export function useLogMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      sender,
      text,
      metadata,
    }: {
      id: string;
      sender: 'landlord' | 'ai_suggestion' | 'user';
      text: string;
      metadata?: any;
    }) => {
      return apiFetch<any>(`/apartments/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ sender, text, metadata }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['apartments', variables.id, 'messages'] });
    },
  });
}

/**
 * Custom hook to trigger AI to suggest a new chat reply.
 */
export function useAiSuggestMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      return apiFetch<any>(`/apartments/${id}/messages/suggest`, {
        method: 'POST',
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['apartments', variables.id, 'messages'] });
    },
  });
}

/**
 * Custom hook to update a message text.
 */
export function useUpdateMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, messageId, text }: { id: string; messageId: string; text: string }) => {
      return apiFetch<any>(`/apartments/${id}/messages/${messageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ text }),
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['apartments', variables.id, 'messages'] });
    },
  });
}

/**
 * Custom hook to delete a message.
 */
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, messageId }: { id: string; messageId: string }) => {
      return apiFetch<{ success: boolean; id: string }>(`/apartments/${id}/messages/${messageId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['apartments', variables.id, 'messages'] });
    },
  });
}

