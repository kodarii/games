import {
  type IgdbIntegrationStatusResponse,
  type SaveIgdbIntegrationInput,
  deleteIgdbIntegration,
  fetchIgdbIntegration,
  newIdempotencyKey,
  saveIgdbIntegration,
} from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

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
 * Sends `PUT /api/integrations/igdb` with a useRef-cached `Idempotency-Key`
 * (one key per mutation instance — see Plan 04-04). The hook supplies the key
 * itself, so callers pass only the credential payload (clientId / clientSecret /
 * enabled) and never generate UUIDs inline.
 *
 * On success: cache is refreshed in-place, the legacy `igdb-status` query
 * (still used by the add-game-modal flow) is invalidated so it re-fetches,
 * and the cached key is rotated so the next user-driven save uses a fresh
 * UUID. Retry-after-failure within the same hook instance reuses the cached
 * key, so the server-side idempotency middleware deduplicates retries.
 */
export function useSaveIgdbIntegrationMutation() {
  const qc = useQueryClient();
  const idempotencyKeyRef = useRef(newIdempotencyKey());
  return useMutation({
    mutationFn: (input: Omit<SaveIgdbIntegrationInput, 'idempotencyKey'>) =>
      saveIgdbIntegration({ ...input, idempotencyKey: idempotencyKeyRef.current }),
    onSuccess: (data) => {
      idempotencyKeyRef.current = newIdempotencyKey();
      qc.setQueryData(igdbIntegrationQueryKey, data);
      qc.invalidateQueries({ queryKey: ['igdb-status'] });
    },
  });
}

/**
 * Sends `DELETE /api/integrations/igdb` with a useRef-cached
 * `Idempotency-Key` (one key per mutation instance — see Plan 04-04). The
 * hook supplies the key itself; callers invoke `mutate()` without arguments.
 *
 * On success: writes a fresh `not-configured` snapshot into the integration
 * cache, invalidates the legacy `igdb-status` query so add-game-modal,
 * title-autocomplete, metadata-match-picker, and rematch-button immediately
 * fall back to the manual flow without a full-page refresh, and rotates the
 * cached idempotency key so the next clear (if the user re-configures and
 * disconnects again) uses a fresh UUID. Retry-after-failure within the same
 * hook instance reuses the cached key, so the server-side idempotency
 * middleware deduplicates retries.
 */
export function useClearIgdbIntegrationMutation() {
  const qc = useQueryClient();
  const idempotencyKeyRef = useRef(newIdempotencyKey());
  return useMutation({
    mutationFn: () => deleteIgdbIntegration(idempotencyKeyRef.current),
    onSuccess: () => {
      idempotencyKeyRef.current = newIdempotencyKey();
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
