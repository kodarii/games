# Add Game Modal Rebuild — Faza 1: Hook stanu modala

## Goal

Zbudować **nowy hook** `useAddGameModalState({ kind })`, który zastępuje
`useAddGameWithMetadata` w przebudowanym modalu. Hook ma:

- Trzymać pola formularza: `title`, `platform`, `color`, `selectedCandidate`.
- Hydratować pola gdy użytkownik wybierze kandydata z IGDB
  (`coverImage`, `developer`, `releaseYear` zapamiętane w stanie).
- Eksponować jeden `submit({ onSuccess })` rozgałęziający się po `kind`:
  - `owned` → `useCreateGameMutation`, payload `CreateGameInput` z
    opcjonalnym `metadataRef`.
  - `wishlist` → `useCreateWishlistMutation`, payload `CreateWishlistInput`
    z opcjonalnym `developer` z kandydata. **Bez** `metadataRef`.
- Mieć `reset()` (czyści stan + reset mutacji).
- **Nie mieć** step state ani `goStep1/goStep2` — modal staje się jednoetapowy.

Stary `useAddGameWithMetadata` w tej fazie zostaje na dysku (usunięcie w fazie 3).

## Pliki

- `apps/client/src/hooks/use-add-game-modal-state.ts` (nowy)

## Hard constraints

- Bez `any`, `@ts-ignore`, `eslint-disable`.
- Submit error idzie przez `mutation.error` (renderowane potem w UI),
  **nie** try/catch ze swallowem.
- `metadataRef` doklejaj **tylko** gdy `selectedCandidate !== null` i
  `kind === 'owned'`.
- `developer` w trybie wishlist ustawiaj tylko gdy `selectedCandidate.developer`
  jest stringiem niepustym.
- Nie używaj sed/perl/heredoc do edycji — wyłącznie `Read`/`Write`/`Edit`.
- TDD niemożliwy w `apps/client` (brak harness'a). Weryfikacja: `tsc --noEmit`
  + manualny rzut okiem na shape eksportu (zgodność z fazą 2).

## Kroki

### Krok 1. Sprawdź referencje

```bash
grep -n "useAddGameWithMetadata" -r apps/client/src
```

Powinien się pojawić **tylko** w `apps/client/src/components/add-game-dialog.tsx`
i w samym pliku hooka. Jeśli więcej miejsc — STOP, raportuj jako blocker.

Sprawdź też shape eksportów potrzebnych w fazie 2:

```bash
grep -n "CreateGameInput\|CreateWishlistInput\|MetadataCandidate" apps/client/src/lib/api.ts apps/client/src/types.ts
```

`CreateGameInput.metadataRef` to `{ providerName: 'igdb'; providerId: string }`.
`CreateWishlistInput` nie ma `metadataRef` ani `coverImage`/`coverColor`.

### Krok 2. Napisz hook

`apps/client/src/hooks/use-add-game-modal-state.ts`:

```ts
import { COVER_COLORS } from '@/lib/avatar';
import {
  useCreateGameMutation,
  useCreateWishlistMutation,
} from '@/lib/queries';
import type { MetadataCandidate } from '@/types';
import { useCallback, useState } from 'react';

export type AddGameKind = 'owned' | 'wishlist';

export interface UseAddGameModalStateArgs {
  kind: AddGameKind;
  initialPlatform: string;
}

export interface UseAddGameModalStateResult {
  title: string;
  setTitle: (v: string) => void;
  platform: string;
  setPlatform: (v: string) => void;
  color: string;
  setColor: (v: string) => void;
  selectedCandidate: MetadataCandidate | null;
  pickCandidate: (c: MetadataCandidate) => void;
  clearCandidate: () => void;
  ownedMutation: ReturnType<typeof useCreateGameMutation>;
  wishlistMutation: ReturnType<typeof useCreateWishlistMutation>;
  /** True jeśli aktywna mutacja (właściwa dla `kind`) jest pending. */
  isSubmitting: boolean;
  /** Aktywny error (z mutacji właściwej dla `kind`) — albo null. */
  submitError: Error | null;
  submit: (opts: { onSuccess: (game: { id: string }) => void }) => void;
  reset: () => void;
}

export function useAddGameModalState(
  args: UseAddGameModalStateArgs,
): UseAddGameModalStateResult {
  const { kind, initialPlatform } = args;
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState(initialPlatform);
  const [color, setColor] = useState<string>(COVER_COLORS[0]);
  const [selectedCandidate, setSelectedCandidate] =
    useState<MetadataCandidate | null>(null);

  const ownedMutation = useCreateGameMutation();
  const wishlistMutation = useCreateWishlistMutation();

  const activeMutation = kind === 'owned' ? ownedMutation : wishlistMutation;

  const pickCandidate = useCallback((c: MetadataCandidate) => {
    setSelectedCandidate(c);
    setTitle(c.title);
  }, []);

  const clearCandidate = useCallback(() => {
    setSelectedCandidate(null);
  }, []);

  const submit = (opts: { onSuccess: (game: { id: string }) => void }) => {
    const trimmed = title.trim();
    if (trimmed === '' || platform === '') return;

    if (kind === 'owned') {
      const base = {
        title: trimmed,
        platform,
        status: 'Backlog' as const,
        format: 'physical' as const,
        coverColor: color,
      };
      const payload = selectedCandidate
        ? {
            ...base,
            coverImage: selectedCandidate.coverImageUrl ?? undefined,
            releaseYear: selectedCandidate.releaseYear ?? undefined,
            developer: selectedCandidate.developer ?? undefined,
            metadataRef: {
              providerName: 'igdb' as const,
              providerId: selectedCandidate.providerId,
            },
          }
        : base;
      ownedMutation.mutate(payload, { onSuccess: opts.onSuccess });
      return;
    }

    // kind === 'wishlist'
    const developer =
      selectedCandidate?.developer &&
      selectedCandidate.developer.trim().length > 0
        ? selectedCandidate.developer
        : undefined;
    wishlistMutation.mutate(
      { kind: 'wishlist', title: trimmed, platform, developer },
      { onSuccess: opts.onSuccess },
    );
  };

  const ownedReset = ownedMutation.reset;
  const wishlistReset = wishlistMutation.reset;
  const reset = useCallback(() => {
    setTitle('');
    setPlatform(initialPlatform);
    setColor(COVER_COLORS[0]);
    setSelectedCandidate(null);
    ownedReset();
    wishlistReset();
  }, [initialPlatform, ownedReset, wishlistReset]);

  return {
    title,
    setTitle,
    platform,
    setPlatform,
    color,
    setColor,
    selectedCandidate,
    pickCandidate,
    clearCandidate,
    ownedMutation,
    wishlistMutation,
    isSubmitting: activeMutation.isPending,
    submitError: activeMutation.error,
    submit,
    reset,
  };
}
```

> **Uwaga**: `setTitle` z hooka **nie** czyści automatycznie `selectedCandidate`.
> Decyzję, kiedy zerwać "powiązanie" z kandydatem (np. gdy user ręcznie edytuje
> tytuł po wybraniu kandydata), podejmie faza 2 wołając `clearCandidate()`
> z handlera onChange inputa. Hook jest tylko storem — UI sterowniczy.

### Krok 3. Sanity check

```bash
bun --cwd apps/client run typecheck   # lub: cd apps/client && bunx tsc --noEmit
```

Oczekiwany wynik: brak nowych błędów (pre-existing errors w
`games-mobile-list.tsx` mogą się utrzymać — nie tykasz).

```bash
git status apps/client/src/hooks/
```

Powinien pokazać tylko `use-add-game-modal-state.ts` jako new file.

### Krok 4. Raport

Zwróć raport ≤200 słów w formacie z briefingu (`STATUS`, `SUMMARY`, `FILES`,
`CHECKS`, `NEXT-PHASE-NEEDS-TO-KNOW`). W `NEXT-PHASE-NEEDS-TO-KNOW` koniecznie:

- Pełny import path nowego hooka.
- Pełny shape zwracany przez hook (lista pól) — faza 2 będzie z niego destructurować.
- Czy `useAddGameWithMetadata` ma jeszcze innych konsumentów (do decyzji w fazie 3).
