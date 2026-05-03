# Custom Covers — Faza 3: Frontend

## Goal
Dodaj na froncie:
1. Hook `useMyPermissions()` — pyta `/api/me/permissions`, mówi czy można uploadować
2. Hook `useUploadCoverMutation()` — uploaduje plik do `/api/upload/cover`
3. Komponent `UploadCoverButton` — file input + Upload/Uploading/Remove + inline error; ukryty dla userów spoza allowlisty
4. Wpięcie w `game-form.tsx` (create + edit) i `game-view.tsx` (inline edit)
5. `<GameCover src={game.coverImage} />` w listach/gridach gier

**UWAGA:** wcześniejsza wersja planu zakładała stronę `/settings` z polem na token UploadThing. **TO ZNIKA.** Token jest globalny w ENV (Faza 2). Strona `/settings` zostaje placeholderem — **NIE TYKAJ** `apps/client/src/main.tsx` ani sidebara.

## Definition of Done
- [ ] `useMyPermissions()` zwraca `{ canUploadCovers: boolean }`
- [ ] `UploadCoverButton` renderuje się tylko dla allowlistowanych userów
- [ ] Klik „Upload cover" → file picker → upload → URL w stanie formularza
- [ ] „Remove" czyści `coverImage` w stanie (nie wysyła nic do UT — backend skasuje przy save'ie)
- [ ] Walidacja po stronie klienta: `accept="image/jpeg,image/png,image/webp"` (server i tak waliduje)
- [ ] Inline error pod przyciskiem (nie alert) — mapowanie 400 → "Only JPEG/PNG/WebP under 5MB", inne → "Upload failed, try again"
- [ ] `<GameCover src={game.coverImage} />` w `game-form`, `game-view` (view + edit), `games-grid`, `games-mobile-list`, `games-columns`
- [ ] `cd apps/client && bun run check && bun run lint` — czysto

Agent kończy WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**Wcześniejsza faza:** API gotowe — `/api/me/permissions`, `/api/upload/cover`, `/api/games` akceptuje `coverImage`
**UI:** Tailwind CSS + lokalne komponenty z `@/components/ui/*`
**State:** React Query dla server, `useState` lokalny dla form

### Step 0: Pobierz docs

Użyj **Context7 MCP**:
- Library: `@tanstack/react-query` — query: "useMutation file upload FormData"

---

## Design decisions
- **Brak strony `/settings`** — Placeholder zostaje, nikt go nie tyka
- Upload = osobna mutacja React Query (`useUploadCoverMutation`), NIE wbudowana w `useUpdateGameMutation`
- URL z uploadu wpisywany do form state → wysyłany razem z resztą pól w PUT/POST games
- **Cleanup orphanów leży po stronie backendu** (Faza 2: `UpdateGame`/`DeleteGame` + cron). Frontend nigdy nie woła delete bezpośrednio
- `<GameCover>` już obsługuje prop `src` — wystarczy go przekazać. Jeśli `src` jest truthy → pokazuje obrazek; w przeciwnym razie fallback (kolor + inicjały)
- Permission gating: `UploadCoverButton` wewnętrznie sprawdza `useMyPermissions()` → jeśli `false`, zwraca `null`. Dzięki temu rodzice (`game-form`, `game-view`) zawsze go renderują, bez ifów
- Nie używamy `accept="image/*"` — szczegółowa lista MIME zgadza się z serwerową walidacją

---

## Relevant files

### Utwórz nowe:
- `apps/client/src/components/upload-cover-button.tsx`

### Edytuj:
- `apps/client/src/types.ts` — dodaj `coverImage` do `Game`
- `apps/client/src/lib/api.ts` — extend Create/UpdateGameInput; dodaj `uploadCover`, `fetchPermissions`
- `apps/client/src/lib/queries.ts` — dodaj `useMyPermissions`, `useUploadCoverMutation`
- `apps/client/src/components/game-form.tsx` — `coverImage` w state, render `<UploadCoverButton>`, wysyłka w payload
- `apps/client/src/pages/game-view.tsx` — `coverImage` w draft, `<UploadCoverButton>` w edit, wysyłka w save
- `apps/client/src/pages/games-grid.tsx` — `<GameCover src={game.coverImage}>`
- `apps/client/src/pages/games-mobile-list.tsx` — `<GameCover src={game.coverImage}>`
- `apps/client/src/pages/games-columns.tsx` — `<GameCover src={row.original.coverImage}>`

### Czytaj ale NIE edytuj:
- `apps/client/src/components/game-cover.tsx` — już ma prop `src`
- `apps/client/src/components/ui/button.tsx`
- `apps/client/src/lib/auth-client.ts` — `useSession` wzorzec

---

## Steps

### Step 1: Types

**Plik:** `apps/client/src/types.ts`

Do `interface Game` dodaj (po `coverColor`):
```ts
coverImage?: string | null;
```

---

### Step 2: API client

**Plik:** `apps/client/src/lib/api.ts`

1. Do `interface CreateGameInput` dodaj:
   ```ts
   coverImage?: string | null;
   ```
   (`UpdateGameInput = CreateGameInput`, więc dziedziczy.)

2. Na końcu pliku dodaj funkcje:
   ```ts
   export async function uploadCover(file: File): Promise<{ url: string }> {
     const fd = new FormData();
     fd.append('file', file);
     const r = await fetch('/api/upload/cover', {
       method: 'POST',
       credentials: 'include',
       body: fd,
     });
     if (!r.ok) {
       const body = await r.json().catch(() => ({}));
       const e = new Error(body?.error ?? `upload_failed`);
       (e as any).status = r.status;
       throw e;
     }
     return r.json();
   }

   export async function fetchMyPermissions(): Promise<{ canUploadCovers: boolean }> {
     const r = await fetch('/api/me/permissions', { credentials: 'include' });
     if (!r.ok) throw new Error(`Failed to fetch permissions: ${r.status}`);
     return r.json();
   }
   ```

---

### Step 3: React Query hooks

**Plik:** `apps/client/src/lib/queries.ts`

1. Do importów z `'./api'` dodaj `uploadCover, fetchMyPermissions`.

2. Dodaj na końcu pliku:
   ```ts
   export function useMyPermissions() {
     return useQuery({
       queryKey: ['me', 'permissions'],
       queryFn: fetchMyPermissions,
       staleTime: 5 * 60 * 1000,
     });
   }

   export function useUploadCoverMutation() {
     return useMutation({
       mutationFn: (file: File) => uploadCover(file),
     });
   }
   ```

**Sprawdź:** `cd apps/client && bun run check`

---

### Step 4: Komponent `UploadCoverButton`

**Plik:** `apps/client/src/components/upload-cover-button.tsx`

```tsx
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMyPermissions, useUploadCoverMutation } from '@/lib/queries';

const ACCEPT = 'image/jpeg,image/png,image/webp';

export function UploadCoverButton({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
}) {
  const { data: perms } = useMyPermissions();
  const uploadMutation = useUploadCoverMutation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  if (!perms?.canUploadCovers) return null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const result = await uploadMutation.mutateAsync(file);
      onChange(result.url);
    } catch (err: any) {
      if (err?.status === 400) {
        setError('Only JPEG/PNG/WebP under 5MB');
      } else {
        setError('Upload failed, try again');
      }
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadMutation.isPending ? 'Uploading…' : 'Upload cover'}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploadMutation.isPending}
            onClick={() => {
              setError(null);
              onChange(null);
            }}
          >
            Remove
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
```

---

### Step 5: Wpięcie w `game-form.tsx`

**Plik:** `apps/client/src/components/game-form.tsx`

1. Importy:
   ```ts
   import { UploadCoverButton } from '@/components/upload-cover-button';
   ```

2. W typie `FormState` dodaj:
   ```ts
   coverImage: string | null;
   ```

3. W `EMPTY` dodaj:
   ```ts
   coverImage: null,
   ```

4. W `gameToFormState(g)` dodaj:
   ```ts
   coverImage: g.coverImage ?? null,
   ```

5. W JSX znajdź `<GameCover name={form.title} color={form.coverColor} />` (linia ~165) i dodaj prop `src`:
   ```tsx
   <GameCover name={form.title} color={form.coverColor} src={form.coverImage} />
   ```

6. Pod `<CoverColorPicker>` w tym samym kontenerze dodaj upload UI. Cały blok cover-config ma teraz strukturę:
   ```tsx
   <div>
     <div className="mb-[6px] text-[10px] font-semibold uppercase tracking-[0.08em] text-apex-hint">
       Cover Color
     </div>
     <CoverColorPicker
       value={form.coverColor}
       onChange={(c) => set('coverColor', c)}
     />
   </div>
   <UploadCoverButton
     value={form.coverImage}
     onChange={(url) => set('coverImage', url)}
   />
   ```

7. W `onSubmit`, w `payload` dodaj:
   ```ts
   coverImage: form.coverImage,
   ```

**Sprawdź:** `cd apps/client && bun run check`

---

### Step 6: Wpięcie w `game-view.tsx`

**Plik:** `apps/client/src/pages/game-view.tsx`

1. Importy:
   ```ts
   import { UploadCoverButton } from '@/components/upload-cover-button';
   ```

2. W typie `DraftState` dodaj:
   ```ts
   coverImage: string | null;
   ```

3. W `gameToDraft(g)` dodaj:
   ```ts
   coverImage: g.coverImage ?? null,
   ```

4. Znajdź `<GameCover name={liveTitle} color={liveCoverColor} />` (linia ~365). Zamień na:
   ```tsx
   <GameCover
     name={liveTitle}
     color={liveCoverColor}
     src={editMode && draft ? draft.coverImage : (game.coverImage ?? null)}
   />
   ```

5. W bloku edit-mode (gdzie jest `<CoverColorPicker>`) — pod nim dodaj:
   ```tsx
   <div className="mt-3">
     <UploadCoverButton
       value={draft.coverImage}
       onChange={(url) => set('coverImage', url)}
     />
   </div>
   ```

6. W `saveEdit`, w `input` dodaj:
   ```ts
   coverImage: draft.coverImage,
   ```

**Sprawdź:** `cd apps/client && bun run check`

---

### Step 7: Lista gier — pokaż obrazki

Trzy pliki, każdy ma `<GameCover>` lub jego rozwinięcie:

**7a) `apps/client/src/pages/games-grid.tsx`**

Linia ~19: ten plik renderuje cover ręcznie (bez `<GameCover>`) — używa `coverColorFor(game)` + inicjały. Trzeba dodać warianty: jeśli `game.coverImage` istnieje, render `<img>` zamiast inicjałów; w przeciwnym wypadku istniejący fallback.

Najprościej — zastąp ręczny render komponentem `<GameCover>`:
```tsx
import { GameCover } from '@/components/game-cover';
// w miejscu gdzie był ręczny div z bg + inicjały:
<GameCover name={game.title} color={game.coverColor} src={game.coverImage} />
```

(Zachowaj klasy rozmiaru wokół niego — `<GameCover>` przyjmuje `className`.)

**7b) `apps/client/src/pages/games-mobile-list.tsx`**

Linia ~35: `<GameCover ... color={game.coverColor} />`. Dodaj prop:
```tsx
<GameCover ... color={game.coverColor} src={game.coverImage} />
```

**7c) `apps/client/src/pages/games-columns.tsx`**

Linia ~16: `<GameCover ... color={row.original.coverColor} />`. Dodaj prop:
```tsx
<GameCover ... color={row.original.coverColor} src={row.original.coverImage} />
```

---

### Step 8: Final check

```bash
cd apps/client && bun run check && bun run lint
```

Manualny smoke test:
1. Zaloguj się jako user **w allowliście** → `/api/me/permissions` zwraca `true` → przycisk „Upload cover" widoczny w edycji gry
2. Zaloguj się jako user **spoza allowlisty** → przycisk ukryty (komponent zwraca `null`)
3. Upload JPEG ≤5 MB → URL trafia do form state → save → przy reloadzie widać cover na liście i w widoku gry
4. Upload PDF / 10 MB JPEG → inline error „Only JPEG/PNG/WebP under 5MB"
5. Edycja gry z coverem → upload nowego → save → backend kasuje stary URL z UT (sprawdzić w logach API)
6. Delete gry z coverem → backend kasuje URL z UT (sprawdzić w logach API)

---

## If you get stuck

Jeśli po 2 próbach coś nie działa, ZATRZYMAJ się i napisz:
```
STUCK at Step <N>: <co konkretnie, jaki błąd, hipoteza>
```

Najczęstsze pułapki:
- `<GameCover>` nie pokazuje obrazka mimo że `src` jest stringiem → sprawdź czy backend zwraca `coverImage: string` (NIE `null`/`undefined` gdy ustawione)
- Przycisk Upload widoczny mimo braku permission → sprawdź czy `useMyPermissions` ma `staleTime` i czy zalogowany user faktycznie nie jest w allowliście (sprawdź `UPLOAD_ALLOWED_EMAILS` w `apps/api/.env`)
- `400 invalid_file` mimo że plik OK → backend wymaga MIME `image/jpeg|png|webp` (NIE `image/jpg`); sprawdź `file.type` w devtools
- Po uploadzie miniatura nie odświeża się → `onChange` musi wpłynąć na ten sam state co `<GameCover src>`

Zakończ pracę i poczekaj na pomoc.
