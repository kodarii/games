import {
  type IgdbIntegrationStatusResponse,
  deleteIgdbIntegration,
  fetchIgdbIntegration,
  saveIgdbIntegration,
} from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Query key for the per-user IGDB integration status. Used both by the
 * settings tile and by the save mutation to update the cache.
 */
export const igdbIntegrationQueryKey = ['integrations', 'igdb'] as const;

/**
 * Reads the current IGDB integration state from `/api/integrations/igdb`.
 * Server returns a discriminated union (`not-configured` | `configured`)
 * with masked + raw client id, secret presence and timestamps.
 */
export function useIgdbIntegrationQuery() {
  return useQuery({
    queryKey: igdbIntegrationQueryKey,
    queryFn: ({ signal }) => fetchIgdbIntegration(signal),
    staleTime: 30_000,
  });
}

/**
 * Sends `PUT /api/integrations/igdb` with a caller-supplied `Idempotency-Key`.
 * On success: cache is refreshed in-place AND the legacy `igdb-status` query
 * (still used by the add-game-modal flow) is invalidated so it re-fetches.
 */
export function useSaveIgdbIntegrationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveIgdbIntegration,
    onSuccess: (data) => {
      qc.setQueryData(igdbIntegrationQueryKey, data);
      qc.invalidateQueries({ queryKey: ['igdb-status'] });
    },
  });
}

/**
 * Sends `DELETE /api/integrations/igdb` with a caller-supplied
 * `Idempotency-Key`. On success: writes a fresh `not-configured` snapshot
 * into the integration cache and invalidates the legacy `igdb-status`
 * query so add-game-modal, title-autocomplete, metadata-match-picker, and
 * rematch-button immediately fall back to the manual flow without a
 * full-page refresh.
 */
export function useClearIgdbIntegrationMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) => deleteIgdbIntegration(idempotencyKey),
    onSuccess: () => {
      const cleared: IgdbIntegrationStatusResponse = {
        status: 'not-configured',
        enabled: false,
        clientId: null,
        clientIdMasked: null,
        hasSecret: false,
        lastVerifiedAt: null,
        updatedAt: null,
      };
      qc.setQueryData(igdbIntegrationQueryKey, cleared);
      qc.invalidateQueries({ queryKey: ['igdb-status'] });
    },
  });
}
