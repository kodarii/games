# Games Filter & Sort — Manual Smoke Checklist

Frontend testów automatycznych nie ma w projekcie (vitest/playwright nieobecne).
Ta lista jest do skopiowania do PR description / Linear ticket przed merge.

## Desktop (≥ 768px)

- [ ] `/games` i `/wishlist` mają w toolbar przyciski "Filter" i "Sort"
- [ ] Klik "Filter" otwiera Radix Popover (NIE drawer)
- [ ] Selekcja platformy → niebieski outline na pillu, URL `?platforms=...`
- [ ] Klik tej samej platformy ponownie → odznaczenie
- [ ] Selekcja formatu → URL `?formats=...`
- [ ] Drag slidera lat → URL update DOPIERO po puszczeniu (NIE w trakcie drag)
- [ ] Wpisanie `2030` w left input + blur → swap, toast "Switched range"
- [ ] Wpisanie `1900` w left input → reject, slider wraca do ostatniej wartości
- [ ] "Reset all" w popoverze → wszystkie filtry znikają, URL czysty, badge znika
- [ ] Filter trigger gdy aktywne: niebieski border + badge z liczbą
- [ ] Klik "Sort" → popover z listą pól
- [ ] Klik "Title" → asc, klik ponownie → desc, klik trzeci raz → unsorted
- [ ] Sortowanie też klikalne z nagłówków tabeli (istniejące zachowanie nie zepsute)
- [ ] Empty state po filtrach które nie matchują → CTA "Reset filters" działa

## Mobile (< 768px, devtools width 375)

- [ ] Toolbar widoczny, NIE schowany
- [ ] Klik "Filter" → bottom drawer (Vaul), swipe-to-close działa
- [ ] Numeric inputs lat → mobile keyboard pokazuje cyfry (`inputMode="numeric"`)
- [ ] Drawer NIE psuje scrollu strony

## Sieciowe / API

- [ ] DevTools Network: request `/api/games` zawiera **repeated params** `?platforms=PC&platforms=PS5` (NIE CSV `?platforms=PC,PS5`)
- [ ] Default range 2000-2030 NIE wysyła `releaseYearFrom`/`releaseYearTo` do API
- [ ] Slider drag → tylko 1 request po puszczeniu (NIE per pixel)
- [ ] Szybka zmiana platformy 5× → ostatni request wygrywa, poprzednie aborted (czerwony "cancelled" w Network — TanStack Query + AbortSignal z Fazy 6)
- [ ] POST `/api/games` z bad payloadem (np. pustym title przez Add Game) → toast pokazuje sensowną wiadomość z `detail` (RFC 7807), NIE generyczne "Failed to create game: 400"

## Accessibility

- [ ] Tab przez pills → focus ring widoczny
- [ ] Space/Enter na pillu → toggle
- [ ] Esc w popoverze → zamyka i wraca focus na trigger
- [ ] Screen reader (VoiceOver mac / NVDA win): pill ma `checkbox, checked/not checked`

## Regression

- [ ] Lista gier ładuje się gdy 0 filtrów
- [ ] Search działa równolegle z filtrami
- [ ] Add game / Edit game / Delete game niezmienione
- [ ] Wishlist przekierowuje do `/wishlist/:id` po kliknięciu

## Backend coverage (już automatyczne — sanity dla reviewerów)

Następujące scenariusze są pokryte testami automatycznymi i NIE wymagają manualnego sprawdzenia:

- IDOR resistance: 9 testów w `apps/api/src/routes/games.idor.test.ts`
- EXPLAIN QUERY PLAN: 4 typowe queries używają indeksów (`apps/api/src/infrastructure/games/drizzle-game-repository.explain.test.ts`)
- Perf budget: list 5000 rows + filter < 100ms (ten sam plik)
- RFC 7807 error contract: 5 testów w `apps/api/src/routes/games.test.ts`
- Filter logic + Zod validation: 17 testów w `apps/api/src/application/games/list-games.test.ts`
- Drizzle list filtering: 7 testów w `apps/api/src/infrastructure/games/drizzle-game-repository.test.ts`
- Domain VO `ReleaseYearRange`: 6 testów w `apps/api/src/domain/games/release-year-range.test.ts`
