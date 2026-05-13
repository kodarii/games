import { COVER_COLORS } from '@/lib/avatar';
import { useCreateGameMutation, useMetadataCandidatesQuery } from '@/lib/queries';
import type { MetadataCandidate } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

export type AddGameMode = 'collection' | 'wishlist';

type CreateMutationVars = Parameters<ReturnType<typeof useCreateGameMutation>['mutate']>[0];

export interface UseAddGameWithMetadataOptions {
  mode: AddGameMode;
  initialPlatform: string;
}

export interface UseAddGameWithMetadataResult {
  mode: AddGameMode;
  title: string;
  setTitle: (v: string) => void;
  platform: string;
  setPlatform: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  selectedProviderId: string | null;
  setSelectedProviderId: (v: string | null) => void;
  selectedCandidate: MetadataCandidate | null;
  candidatesQuery: ReturnType<typeof useMetadataCandidatesQuery>;
  createMutation: ReturnType<typeof useCreateGameMutation>;
  submit: (opts: { onSuccess: (game: { id: string }) => void }) => void;
  reset: () => void;
}

/**
 * State machine for the unified AddGameModal (both collection + wishlist modes).
 *
 * Drops the previous two-step Find-match flow; the autocomplete dropdown is now
 * inline under the title input. Debounces `title` by 250 ms before it drives
 * the IGDB candidates query, so users typing fast don't fire one request per
 * keystroke. The MATCHED pill is cleared automatically whenever the user edits
 * the title further.
 *
 * For both `'collection'` and `'wishlist'` mode the underlying mutation is the
 * SAME (`useCreateGameMutation`) — the backend `CreateGame` use case accepts
 * `coverColor`, `coverImage`, `releaseYear`, `developer`, `metadataRef` for the
 * `kind: 'wishlist'` discriminated branch (see
 * `apps/api/src/application/games/create-game.ts:53-72`).
 */
export function useAddGameWithMetadata(
  opts: UseAddGameWithMetadataOptions,
): UseAddGameWithMetadataResult {
  const { mode, initialPlatform } = opts;
  const [title, setTitle] = useState('');
  const [debouncedTitle, setDebouncedTitle] = useState('');
  const [platform, setPlatform] = useState(initialPlatform);
  const [color, setColor] = useState<string>(COVER_COLORS[0]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // Debounce: candidates query is driven by `debouncedTitle`, lagging `title` by 250ms.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTitle(title), 250);
    return () => clearTimeout(handle);
  }, [title]);

  // Editing the title clears any prior MATCHED selection so the pill disappears
  // as soon as the user diverges from the picked candidate. The dep array
  // intentionally tracks `title` only — `setSelectedProviderId` is stable.
  // biome-ignore lint/correctness/useExhaustiveDependencies: setSelectedProviderId is a setter from useState and is stable across renders.
  useEffect(() => {
    setSelectedProviderId(null);
  }, [title]);

  const enableCandidates = debouncedTitle.trim().length >= 2 && platform.length > 0;
  const candidatesQuery = useMetadataCandidatesQuery(debouncedTitle, platform, enableCandidates);
  const createMutation = useCreateGameMutation();
  const queryClient = useQueryClient();

  const selectedCandidate: MetadataCandidate | null =
    candidatesQuery.data?.candidates.find((c) => c.providerId === selectedProviderId) ?? null;

  const submit = (subOpts: { onSuccess: (game: { id: string }) => void }) => {
    const base: CreateMutationVars = {
      kind: mode === 'wishlist' ? 'wishlist' : 'owned',
      title: title.trim(),
      platform,
      coverColor: color,
      format: 'physical',
      ...(mode === 'collection' ? { status: 'Backlog' as const } : {}),
    };

    const payload: CreateMutationVars = selectedCandidate
      ? {
          ...base,
          coverImage: selectedCandidate.coverImageUrl ?? undefined,
          releaseYear: selectedCandidate.releaseYear ?? undefined,
          developer: selectedCandidate.developer ?? undefined,
          metadataRef: {
            providerName: 'igdb',
            providerId: selectedCandidate.providerId,
          },
        }
      : base;
    // Mutation errors propagate via createMutation.error and are rendered in
    // the modal body — onError is intentionally omitted here.
    createMutation.mutate(payload, { onSuccess: subOpts.onSuccess });
  };

  const createMutationReset = createMutation.reset;
  const reset = useCallback(() => {
    setTitle('');
    setDebouncedTitle('');
    setPlatform(initialPlatform);
    setColor(COVER_COLORS[0]);
    setSelectedProviderId(null);
    createMutationReset();
    queryClient.invalidateQueries({ queryKey: ['metadata-candidates'] });
  }, [initialPlatform, createMutationReset, queryClient]);

  return {
    mode,
    title,
    setTitle,
    platform,
    setPlatform,
    color,
    setColor,
    selectedProviderId,
    setSelectedProviderId,
    selectedCandidate,
    candidatesQuery,
    createMutation,
    submit,
    reset,
  };
}
