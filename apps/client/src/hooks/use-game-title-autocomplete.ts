import { useMetadataCandidatesQuery } from '@/lib/queries';
import type { MetadataCandidate } from '@/types';
import { useEffect, useState } from 'react';

const DEBOUNCE_MS = 300;
const MIN_TITLE_LENGTH = 2;

export interface UseGameTitleAutocompleteArgs {
  title: string;
  platform: string;
  /** Outer gate — typically `igdbConfigured ?? false` from `useIgdbStatusQuery`. */
  enabled: boolean;
}

export interface UseGameTitleAutocompleteResult {
  candidates: readonly MetadataCandidate[];
  isLoading: boolean;
  isError: boolean;
  /** The trimmed title value the underlying request was/would be issued with. */
  debouncedTitle: string;
  /** True when the hook is currently in a state that triggers (or would trigger) a request. */
  isActive: boolean;
}

/**
 * Debounces `title` (300ms) and proxies the result through `useMetadataCandidatesQuery`.
 * The request only fires when: caller said it's enabled, the debounced trimmed title
 * is at least `MIN_TITLE_LENGTH` characters long, and a platform was provided.
 *
 * Intentionally stateless about selection — owning a `selectedCandidate` is the
 * consumer component's job.
 */
export function useGameTitleAutocomplete(
  args: UseGameTitleAutocompleteArgs,
): UseGameTitleAutocompleteResult {
  const { title, platform, enabled } = args;
  const [debouncedTitle, setDebouncedTitle] = useState<string>(() => title.trim());

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedTitle(title.trim());
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [title]);

  const isActive = enabled && debouncedTitle.length >= MIN_TITLE_LENGTH && platform.length > 0;
  const candidatesQuery = useMetadataCandidatesQuery(debouncedTitle, platform, isActive);

  return {
    candidates: candidatesQuery.data?.candidates ?? [],
    isLoading: candidatesQuery.isFetching,
    isError: candidatesQuery.isError,
    debouncedTitle,
    isActive,
  };
}
