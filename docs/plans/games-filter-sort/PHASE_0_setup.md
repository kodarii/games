# Games Filter & Sort — Faza 0: Setup & Dependencies

## Goal
Dodać brakujące pakiety frontowe (Radix Popover, Slider, Vaul drawer, Sonner toast) wymagane przez kolejne fazy. Backend nie wymaga nowych pakietów. Wynikiem fazy są gotowe instalacje + krótka weryfikacja importów.

## Definition of Done
- [ ] `bun install` przechodzi bez błędów
- [ ] Pakiety `@radix-ui/react-popover`, `@radix-ui/react-slider`, `vaul`, `sonner` są obecne w `apps/client/package.json` i `bun.lock`
- [ ] `bun run --cwd apps/client typecheck` zielone
- [ ] `bun run lint` zielone

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — wszędzie używaj `bun`, `bunx`)
**Monorepo:** workspaces; instalacja w workspace klienta przez `bun add --cwd apps/client <pkg>` lub edycja `apps/client/package.json` + `bun install` z roota
**Lint:** Biome (`bun run lint`)

### Relevant files (edit only these)
- `apps/client/package.json`
- `bun.lock` (generowany — NIE edytuj ręcznie)

### Files to read but NOT edit
- `apps/client/package.json` — sprawdź jakie Radix pakiety już są (część jest)
- `package.json` (root) — workspace setup

## Constraints
- NIE używaj `npm`, `pnpm`, `yarn`. Tylko Bun.
- NIE dodawaj pakietów do roota — wszystko do `apps/client`.
- NIE upgrade'uj istniejących pakietów (Radix już w `^1.x` — trzymaj się tej majori).
- NIE dodawaj framer-motion ani innych "fancy" pakietów. Trzymamy się minimalnego zestawu.

## Steps

### Step 1: Dodaj pakiety do apps/client
**Co robimy:**
1. Z roota repo: `bun add --cwd apps/client @radix-ui/react-popover@^1.1 @radix-ui/react-slider@^1.2 vaul@^1.1 sonner@^1.7`
2. Sprawdź że `bun.lock` został zaktualizowany (`git diff bun.lock` powinien pokazać dodane entries)
3. Sprawdź że `apps/client/package.json` ma nowe entry w `dependencies`

**Rezultat:** 4 nowe pakiety zainstalowane, brak błędów w `bun install`.

### Step 2: Smoke import test
**Co robimy:**
1. Utwórz tymczasowy plik `apps/client/src/__smoke_imports.ts` z treścią:
   ```ts
   // Smoke test — usuń po weryfikacji
   import * as Popover from '@radix-ui/react-popover';
   import * as Slider from '@radix-ui/react-slider';
   import { Drawer } from 'vaul';
   import { Toaster } from 'sonner';
   export const _smoke = { Popover, Slider, Drawer, Toaster };
   ```
2. Uruchom `bun run --cwd apps/client typecheck`
3. Jeśli zielone — usuń `__smoke_imports.ts`

**Rezultat:** typecheck zielony, plik smoke usunięty.

### Step 3: Weryfikacja końcowa
**Co robimy:**
1. `bun run lint` — musi być zielone
2. `bun run --filter '*' build` opcjonalnie (długo trwa) — pomiń jeśli typecheck zielony
3. Wypisz w komentarzu PR/commit message: jakie wersje zostały dodane

**Rezultat:** wszystkie sprawdzenia zielone, faza zamknięta.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
