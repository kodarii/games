import { fetchMetadataStatus } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

/**
 * Queries the API for IGDB configuration status.
 *
 * The status is determined once at API process start (from environment variables),
 * so we cache it for the full lifetime of the client session (`staleTime: Infinity`,
 * `gcTime: Infinity`). No retries — if the status endpoint fails, callers should
 * treat `igdbConfigured` as effectively `false` (i.e. fall back to the manual entry
 * flow).
 */
export function useIgdbStatusQuery() {
  return useQuery({
    queryKey: ['igdb-status'] as const,
    queryFn: ({ signal }) => fetchMetadataStatus(signal),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 0,
  });
}
