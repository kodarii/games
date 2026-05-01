# releaseYear optional — Faza 3: Frontend

## Goal
Zaktualizuj typy i komponenty React żeby `releaseYear` był opcjonalny w formularzach
i widokach — puste pole = brak roku (null z API), nie błąd walidacji.

## Definition of Done
- [ ] `bun run typecheck` (w katalogu `apps/client`) — zero błędów
- [ ] Formularz dodawania gry działa bez podania roku wydania
- [ ] Pole rok jest puste gdy gra nie ma roku (nie wyświetla "null" / "0")
- [ ] Tabela gier wyświetla "—" dla gier bez roku

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun run typecheck`)
**UI stack:** React + Tailwind CSS + shadcn/ui (Radix UI)
**API:** backend zwraca `releaseYear: number | null` (nullable JSON field)

## Design decisions
- Typ `Game.releaseYear: number | null` (nie undefined — API zwraca null)
- Form state: `releaseYear: string` — pusty string '' = brak roku
- Submit: `releaseYear: form.releaseYear ? Number(form.releaseYear) : undefined`
  (undefined w payload = Zod `.optional()` przepuszcza, backend zapisuje null)
- Wyświetlanie: `{game.releaseYear ?? '—'}` — tabela i widok detali
- NIE ustawiaj default = bieżący rok — puste pole = brak danych

## Visual spec
Pole "Rok wydania" w formularzu:
- Placeholder: "Rok wydania (opcjonalny)" lub "np. 2024"
- Pusty input przy nowej grze (nie wypełniaj current year)
- Przy edycji: wypełnij jeśli istnieje, puste jeśli null
- Tabela: kolumna "Rok" pokazuje wartość lub "—" gdy null
- Widok detali gry: rok wyświetlony gdy jest, "—" lub brak sekcji gdy null

## Relevant files (edit only these)
- `apps/client/src/types.ts`
- `apps/client/src/lib/api.ts`
- `apps/client/src/components/game-form.tsx`
- `apps/client/src/components/add-game-dialog.tsx`
- `apps/client/src/pages/game-view.tsx`
- `apps/client/src/pages/games-columns.tsx`

## Files to read but NOT edit
- `apps/api/src/application/games/create-game.ts` — żeby znać API payload (releaseYear?: number)

---

## Steps

### Step 0: Przeczytaj pliki
Przeczytaj każdy plik z listy "Relevant files" przed edycją.

### Step 1: Typy

**`apps/client/src/types.ts`** (linia ~11):
```typescript
// PRZED:
releaseYear: number;
// PO:
releaseYear: number | null;
```
Jeśli jest też typ dla sort key (linia ~26) — zostaw bez zmian (`'releaseYear'` jako string jest ok).

**`apps/client/src/lib/api.ts`** (linia ~24):
```typescript
// PRZED:
releaseYear: number;
// PO:
releaseYear: number | null;
```

### Step 2: Formularz tworzenia gry

**`apps/client/src/components/add-game-dialog.tsx`** (linia ~57):
Usuń `releaseYear: new Date().getFullYear()` z domyślnych wartości formularza.
Ustaw `releaseYear: ''` lub po prostu pomiń (formularz powinien startować z pustym polem).

**`apps/client/src/components/game-form.tsx`**:

Inicializacja stanu przy edycji (linia ~58):
```typescript
// PRZED:
releaseYear: String(g.releaseYear),
// PO:
releaseYear: g.releaseYear != null ? String(g.releaseYear) : '',
```

Submit handler (linia ~109):
```typescript
// PRZED:
releaseYear: Number(form.releaseYear) || new Date().getFullYear(),
// PO:
releaseYear: form.releaseYear ? Number(form.releaseYear) : undefined,
```

Placeholder pola input (linia ~213-214) — opcjonalnie dodaj:
```typescript
placeholder="Rok wydania (opcjonalny)"
```

### Step 3: Widok detali gry

**`apps/client/src/pages/game-view.tsx`**:

Inicializacja stanu draft (linia ~51):
```typescript
// PRZED:
releaseYear: String(g.releaseYear),
// PO:
releaseYear: g.releaseYear != null ? String(g.releaseYear) : '',
```

Submit draftu (linia ~243):
```typescript
// PRZED:
releaseYear: Number(draft.releaseYear) || game.releaseYear,
// PO:
releaseYear: draft.releaseYear ? Number(draft.releaseYear) : undefined,
```

Wyświetlanie w trybie readonly (linia ~414):
```typescript
// PRZED:
value={String(game.releaseYear)}
// PO:
value={game.releaseYear != null ? String(game.releaseYear) : ''}
```

Edytowalny input (linia ~419-420) — analogicznie jeśli jest osobny state.

### Step 4: Tabela

**`apps/client/src/pages/games-columns.tsx`** (linia ~50):
Sprawdź czy komórka już ma null guard:
```typescript
{row.original.releaseYear ?? '—'}
```
Jeśli tak — nie zmieniaj. Jeśli nie — dodaj `?? '—'`.

### Step 5: Weryfikacja końcowa
```bash
bun run typecheck   # w katalogu apps/client
```
Zero błędów TypeScript.

Sprawdź manualnie w przeglądarce:
1. Dodaj grę bez roku wydania → gra pojawia się na liście z "—" w kolumnie roku
2. Dodaj grę z rokiem → rok wyświetlony poprawnie
3. Edytuj grę (zmień rok na pusty) → rok znika, tabela pokazuje "—"

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.
