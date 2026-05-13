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
  selectedProviderId: string | null;
  setSelectedProviderId: (v: string | null) => void;
  selectCandidate: (c: MetadataCandidate) => void;
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
 * the IGDB candidates query so users typing fast don't fire one request per
 * keystroke.
 *
 * MATCHED pill is "sticky" only while the typed title matches the picked
 * candidate's title — the moment the user edits the input the derived
 * `selectedCandidate` returns null and the pill disappears. We do this via a
 * derived check (`c.title.trim() === title.trim()`) rather than an effect so
 * we don't have to race state updates when the parent calls
 * `selectCandidate(c)` (which sets title + providerId atomically).
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
  // Cover color is assigned randomly — there is no picker in the modal. The
  // header badge still shows it so the user gets a small visual cue of what
  // the auto-generated cover will look like; `reset()` re-rolls it.
  const [color, setColor] = useState<string>(() => randomCoverColor());
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);

  // Debounce: candidates query is driven by `debouncedTitle`, lagging `title` by 250ms.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedTitle(title), 250);
    return () => clearTimeout(handle);
  }, [title]);

  const enableCandidates = debouncedTitle.trim().length >= 2 && platform.length > 0;
  const candidatesQuery = useMetadataCandidatesQuery(debouncedTitle, platform, enableCandidates);
  const createMutation = useCreateGameMutation();
  const queryClient = useQueryClient();

  // Derived: returns the picked candidate ONLY if the typed title still matches
  // it. Editing the input further re-derives to null automatically — no effect
  // needed.
  const pickedCandidate =
    candidatesQuery.data?.candidates.find((c) => c.providerId === selectedProviderId) ?? null;
  const selectedCandidate: MetadataCandidate | null =
    pickedCandidate && pickedCandidate.title.trim() === title.trim() ? pickedCandidate : null;

  const selectCandidate = useCallback((c: MetadataCandidate) => {
    setTitle(c.title);
    setSelectedProviderId(c.providerId);
  }, []);

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
    setColor(randomCoverColor());
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
    selectedProviderId,
    setSelectedProviderId,
    selectCandidate,
    selectedCandidate,
    candidatesQuery,
    createMutation,
    submit,
    reset,
  };
}

function randomCoverColor(): string {
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
}
