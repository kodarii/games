# Plan: Game Create Form Rebuild

Przebudowa pełnoekranowego formularza tworzenia gry (`apps/client/src/components/game-form.tsx`):
platforma na górze, tytuł niżej z debounced autocomplete IGDB (300ms), wybór kandydata
hydratuje pola formularza i dokleja `metadataRef` przy save. Gdy IGDB nieskonfigurowane —
tytuł jest zwykłym inputem. Submit niezmieniony: `useCreateGameMutation` z `kind` zależnym
od `mode`, redirect na `/games/:id` lub `/wishlist/:id`.

## Fazy

1. **[PHASE 1](./PHASE_1_metadata_status_endpoint.md)** — backend: nowy endpoint `GET /api/games/metadata/status` zwracający `{ igdbConfigured }`, oparty o flagę w `wiring.ts`. TDD, test integracyjny.
2. **[PHASE 2](./PHASE_2_client_autocomplete_hook.md)** — klient: hooki `useIgdbStatusQuery` i `useGameTitleAutocomplete` (debounce 300ms, owijka na `useMetadataCandidatesQuery`). Test debounce'a.
3. **[PHASE 3](./PHASE_3_form_layout_rebuild.md)** — UI: nowy sub-komponent `<GameTitleAutocomplete>` (combobox + dropdown), przebudowa kolejności sekcji w `game-form.tsx`, hydratacja pól z kandydata, dokładanie `metadataRef` w submit.

Każdą fazę odpalaj w osobnej sesji (czysty kontekst). Output kolejnej fazy zakłada że
pliki z poprzedniej leżą na dysku.
