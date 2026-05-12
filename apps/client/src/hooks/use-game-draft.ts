import type { UpdateGameInput } from '@/lib/api';
import {
  type DraftErrors,
  type DraftToPayloadOptions,
  type GameDraft,
  draftToPayload,
  gameToDraft,
  validateDraft,
} from '@/lib/game-draft';
import type { Game } from '@/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface UseGameDraftResult {
  draft: GameDraft;
  set: <K extends keyof GameDraft>(key: K, value: GameDraft[K]) => void;
  reset: () => void;
  errors: DraftErrors;
  isDirty: boolean;
  isValid: boolean;
  toPayload: (opts: DraftToPayloadOptions) => UpdateGameInput;
}

/**
 * Owns the editable form-state for a single game. Pure-function helpers
 * (`gameToDraft`, `draftToPayload`, `validateDraft`) live in
 * `@/lib/game-draft` so the conversion logic stays testable without React.
 *
 * Behaviour:
 * - Seeds the draft from `initialGame` once on mount.
 * - When the underlying game *identity* (`initialGame.id`) changes, re-seeds
 *   the draft from the new game. Re-renders that produce a new `Game`
 *   reference for the *same* id (e.g. TanStack Query refetches) do not
 *   stomp local edits.
 * - `reset()` re-seeds the draft from the current `initialGame`.
 */
export function useGameDraft(initialGame: Game): UseGameDraftResult {
  const latestGame = useRef(initialGame);
  latestGame.current = initialGame;

  const [draft, setDraft] = useState<GameDraft>(() => gameToDraft(initialGame));
  const seededId = useRef(initialGame.id);

  useEffect(() => {
    if (seededId.current !== initialGame.id) {
      seededId.current = initialGame.id;
      setDraft(gameToDraft(initialGame));
    }
  }, [initialGame]);

  const initialSnapshot = useMemo(() => gameToDraft(initialGame), [initialGame]);

  const set = useCallback(<K extends keyof GameDraft>(key: K, value: GameDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  }, []);

  const reset = useCallback(() => {
    setDraft(gameToDraft(latestGame.current));
  }, []);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const isValid = useMemo(() => Object.keys(errors).length === 0, [errors]);

  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialSnapshot),
    [draft, initialSnapshot],
  );

  const toPayload = useCallback(
    (opts: DraftToPayloadOptions) => draftToPayload(draft, opts),
    [draft],
  );

  return { draft, set, reset, errors, isDirty, isValid, toPayload };
}
