---
name: coding-plan-for-local-agents
description: >
  Pisz markdown-owe plany zadań programistycznych zoptymalizowane pod lokalne/otwarte coding
  agents klasy Gemma 3/4 27B, GLM-4.6 (Big Pickle w OpenCode Zen), Qwen Coder, DeepSeek Coder,
  Kimi K2, MiniMax M2 i podobnych open-weight modeli. Triggeruj zawsze gdy użytkownik prosi
  o plan, TODO, task breakdown, spec implementacyjny, workflow lub instrukcje krok-po-kroku
  dla zadania kodowania, które ma być wykonane przez inny model/agenta — szczególnie gdy
  wymienia: OpenCode, Big Pickle, GLM, Gemma, Qwen, DeepSeek, Ollama, LM Studio, lokalny
  model, open-weight, sub-agent, coding agent. Triggeruj też gdy użytkownik planuje wykonanie
  wieloetapowego taska w innej sesji/agencie niż bieżąca rozmowa. Plany pisane są wertykalnie
  (vertical slice przez cały stos: DB → domain → API → UI per feature), z wymuszeniem DDD
  (agregaty, value objects, domain services, ports & adapters), SOLID, separation of concerns
  w React (custom hooks vs prezentacja), Context7 do pobrania docs bibliotek, i jawnym
  stackiem (Bun + Hono + Drizzle + Better-Auth + React + Radix + Tailwind). NIE używaj gdy
  plan jest dla człowieka-dewelopera ani gdy użytkownik prosi o samą implementację tu i teraz.
---

# Plan kodowania dla lokalnych coding agents

## Dlaczego ten skill istnieje

Open-weight coding agents (Big Pickle/GLM-4.6, Gemma 4 27B, Qwen3 Coder itp.) są mocne
w generowaniu kodu, ale w porównaniu z frontier modelami mają cztery słabości:

1. **Pomijają ukryte wymagania** — co nie jest napisane wprost, zostanie pominięte
2. **Dryfują** po ~20 tool-callach — gubią pierwotny cel
3. **Nie wiedzą kiedy skończyć** — refaktorują w kółko lub kończą za wcześnie
4. **Halucynują API bibliotek** — piszą nieistniejące klasy Tailwind, stare hooki React

Plus piąta, architektoniczna:

5. **Domyślnie piszą anemic model** — logika w routerach/kontrolerach, serwisy jako
   przelewalki, brak wartości obiektowych. Bez explicit planu DDD → dostajesz CRUD.

Twoja rola: napisać plan, który domyka te pięć luk — daje explicit wymagania, kotwice
kontekstu, kryteria stopu, wymusza sięganie po docs, i narzuca architekturę DDD.

---

## Stack projektu (domyślny)

Jeśli użytkownik nie podał innego — zakładaj ten stack:

**Backend:** Bun + HonoJS + Drizzle ORM + PostgreSQL + Better-Auth
**Frontend:** React + react-router-dom + Radix UI + Tailwind CSS
**Runtime/PM:** Bun (NIE Node.js, NIE npm)
**Architektura:** DDD, Ports & Adapters (hexagonal), vertical slicing per feature
**Zasady:** SOLID, DRY, YAGNI — kod łatwy w utrzymaniu i rozwijaniu

Jeśli użytkownik ma inny stack — zapytaj i dostosuj szablony.

---

## Zapis planu na dysk

Plan ZAWSZE zapisuj jako plik markdown w katalogu `docs/plans/` w rootcie projektu.
Użyj `create_file` — nie wyświetlaj planu w chacie. Użytkownik otworzy plik sam.

**Konwencja nazewnictwa:**
```
docs/plans/PLAN_<krótka-nazwa-feature>.md
```

Przykłady:
- `docs/plans/PLAN_user-registration.md`
- `docs/plans/PLAN_order-creation.md`
- `docs/plans/PLAN_admin-dashboard.md`

Zasady:
- Nazwa pliku: lowercase, kebab-case, bez spacji, bez polskich znaków
- Jeden plik = jeden plan = jeden feature (vertical slice)
- Jeśli katalog `docs/plans/` nie istnieje — utwórz go
- Po zapisaniu pliku — powiedz użytkownikowi ścieżkę i krótko (2-3 zdania) co plan
  obejmuje. Nie streszczaj całego planu — użytkownik go przeczyta sam

---

## Vertical slice: jak rozbijać zadania

Plan jest ZAWSZE pisany jako **vertical slice** — jeden mały feature przechodzący
przez cały stos. NIE rozpisuj "najpierw cała warstwa DB, potem cała warstwa serwisów,
potem cały frontend". To prowadzi do 500-liniowych PR-ów i niespójności.

Jeden plan = jeden feature/use case, np:
- "Użytkownik może dodać produkt do koszyka"
- "Admin może zobaczyć listę zamówień"
- "System wysyła email po rejestracji"

Jeśli feature jest za duży (>12 kroków) — rozbij na dwa plany z handoffem.

Porządek kroków w vertical slice (TDD — test first):
```
Step 0: Context7 — pobierz docs bibliotek
Step 1: Domain types — typy, interfejsy portów, sygnatury (kompilujący się szkielet)
Step 2: TEST domeny — testy logiki biznesowej agregatu/VO/factory (RED — nie przechodzą)
Step 3: Domain impl — implementacja aż testy z Step 2 przejdą (GREEN)
Step 4: DB schema + migracja (Drizzle)
Step 5: Repository adapter — implementacja portu
Step 6: TEST use case — test z fake/mock repozytorium (RED)
Step 7: Application service — implementacja use case (GREEN)
Step 8: Route handler (Hono) — cienki, deleguje do application service
Step 9: Frontend — custom hook + komponent prezentacyjny
Step 10: Lint & typecheck & all tests green
```

Zasada TDD w planie: **NIE pisz kodu produkcyjnego bez testu który go wymusza.**
Najpierw test (RED), potem implementacja (GREEN), refactor jeśli trzeba.
Agent NIE może pominąć kroku z testem — bez niego następny krok nie ma sensu.

NIE musisz zawsze mieć wszystkich warstw. YAGNI — jeśli feature nie potrzebuje
domain service (bo logika jest trywialna), nie twórz go na siłę. Ale jeśli jest
logika biznesowa — musi być w domenie, nie w routerze. Nawet przy CRUD-ach
test factory/VO jest wymagany (weryfikuje invarianty).

---

## Obowiązkowy Step 0: Context7

Każdy plan zaczyna się od pobrania dokumentacji bibliotek przez Context7.
Bez tego agent halucynuje API (szczególnie Tailwind, Drizzle, Radix).

```markdown
### Step 0: Pobierz dokumentację
**Co robimy:** Użyj Context7 aby pobrać aktualne docs:
- Drizzle ORM: "<konkretne pytanie — np. insert with returning, relations>"
- Radix UI: "<konkretny komponent — np. Dialog, DropdownMenu>"
- Tailwind CSS: "<konkretne klasy — np. grid layout, responsive breakpoints>"
- Better-Auth: "<jeśli feature dotyczy auth>"
- Hono: "<jeśli feature dotyczy routing/middleware>"
**Rezultat:** Masz docs w kontekście. Cały kod piszesz NA PODSTAWIE docs, nie z pamięci.
**WAŻNE:** NIE pomijaj. Jeśli w kolejnym kroku potrzebujesz API biblioteki której
nie pobrałeś — WRÓĆ tu i pobierz zanim zaczniesz kodować.
```

Dopasuj pytania do Context7 do konkretnego feature'a. Nie pisz generycznie
"pobierz docs Drizzle" — napisz "pobierz docs Drizzle: how to define many-to-one
relation with Drizzle ORM relations API".

---

## Szablon planu (pełny vertical slice)

````markdown
# <Nazwa feature'a — jedno zdanie imperatywne, np. "Dodaj endpoint tworzenia zamówienia">

## Goal
<Co ma powstać — 2-4 zdania. Jaki use case realizujemy. Jaki problem rozwiązujemy.>

## Definition of Done
- [ ] <Konkretny warunek sprawdzalny automatycznie — np. "POST /api/orders zwraca 201">
- [ ] Testy domeny przechodzą: `bun test` (unit testy agregatu/VO)
- [ ] Testy use case przechodzą: `bun test` (z fake repozytorium)
- [ ] Logika biznesowa jest w warstwie domeny (NIE w route handlerze)
- [ ] Lint clean: `bun run lint`
- [ ] Typecheck clean: `bun run check`

Agent kończy pracę WYŁĄCZNIE gdy wszystkie powyższe checkboxy są spełnione.

## Context
**Stack:** Bun, Hono, Drizzle ORM, PostgreSQL, Better-Auth, React, react-router-dom, Radix UI, Tailwind CSS
**Runtime:** Bun (NIE Node.js). Komendy:
  - instalacja: `bun add <pkg>` (NIE npm install)
  - uruchomienie: `bun run <script>` (NIE npm run)
  - testy: `bun test` (NIE npm test / jest / vitest)
  - jednorazowo: `bunx <pkg>` (NIE npx)
**Architektura:** DDD, Ports & Adapters. Warstwy:
  - `src/domain/` — agregaty, value objects, domain services, porty (interfejsy)
  - `src/application/` — use cases / command handlers, application services
  - `src/infrastructure/` — adaptery (repozytoria, external services, auth)
  - `src/api/` — route handlery Hono (cienkie, delegują do application)
  - `src/client/` — React frontend
**Konwencje:**
  - Logika biznesowa WYŁĄCZNIE w `src/domain/` — nigdy w routerze, nigdy w komponencie React
  - Repozytoria: interfejs (port) w domain, implementacja (adapter) w infrastructure
  - React: logika w custom hookach, komponenty TYLKO prezentacyjne
  - Error handling: Result<T, E> pattern (nie wyjątki dla błędów domenowych)
  - Nazewnictwo: angielskie, ubiquitous language z domeny

### Relevant files (edit only these)
- `src/domain/<context>/<aggregate>.ts`
- `src/domain/<context>/<port>.ts`
- `src/infrastructure/<context>/<adapter>.ts`
- `src/application/<context>/<use-case>.ts`
- `src/api/routes/<resource>.ts`
- `src/client/features/<feature>/use<Feature>.ts` — custom hook
- `src/client/features/<feature>/<Feature>Page.tsx` — komponent prezentacyjny

### Files to read but NOT edit
- `src/domain/shared/` — shared value objects, Result type
- `src/infrastructure/db/index.ts` — Drizzle config, export `db`
- `src/infrastructure/auth/` — Better-Auth config
- `tailwind.config.ts` — Tailwind config

## Constraints (hard rules)
- TDD: NIE pisz kodu produkcyjnego bez UPRZEDNIEGO testu. Kolejność: test (RED) → implementacja (GREEN) → refactor
- NIE pomijaj kroków z testami — bez nich następny krok nie ma sensu
- NIE wrzucaj logiki biznesowej do route handlera — handler TYLKO: parsuj input → wywołaj use case → zwróć response
- NIE wrzucaj logiki do komponentu React — logika w custom hooku, komponent TYLKO renderuje
- NIE importuj infrastructure w domain — dependency rule: domain nie zna infrastructure
- NIE dodawaj zależności (`bun add`) bez jawnej zgody
- NIE modyfikuj plików spoza listy "Relevant files"
- NIE twórz abstrakcji "na zapas" (YAGNI) — ale jeśli jest logika biznesowa, MUSI być w domenie
- NIE pisz klas/hooków Tailwind ani API Radix z pamięci — używaj docs z Step 0
- Nazwy klas/funkcji z domeny biznesowej (NIE: Manager, Handler, Data, Info, Utils)

## Implementation plan

### Step 0: Pobierz dokumentację
**Co robimy:** Użyj Context7 aby pobrać docs:
- <biblioteki potrzebne w tym feature>
**WAŻNE:** NIE pomijaj. Koduj na podstawie pobranych docs.

### Step 1: Domain types (szkielet)
**Co robimy:** W `src/domain/<context>/` utwórz TYPY i SYGNATURY (bez implementacji):

**Value Objects** — każde pole z regułą biznesową dostaje własny typ:
- <NazwaVO> — opakowuje <typ bazowy>, waliduje: <reguła>
- NIE używaj gołych stringów/numberów na pola z invariantami
- Factory: `create<VO>(raw: <bazowy>): Result<VO, Error>` — walidacja w factory
- Przykład sygnatury (TYLKO jeśli model potrzebuje wzorca):
  ```typescript
  type GameTitle = { readonly _brand: 'GameTitle'; readonly value: string };
  function createGameTitle(raw: string): Result<GameTitle, { kind: 'title_empty' }>;
  ```

**Aggregate** — pełny typ z tożsamością:
- ID generowane w domenie (UUID), NIE auto-increment z bazy
- Pola używają Value Objects, nie prymitywów (jeśli mają invarianty)
- Factory `create<Aggregate>(input): Result<Aggregate, DomainError>` tworzy PEŁNY
  obiekt (z id), nie DTO-bez-id
- Metody biznesowe jako funkcje: `<akcja>(aggregate, params): Result<Aggregate, Error>`

**Domain Errors** — osobny typ na każdy rodzaj błędu:
- `{ kind: '<nazwa>' }` — unikalne per error, NIE reużywaj tego samego kind

**Port (interfejs):** `<Nazwa>Repository` — sygnatury metod CRUD + query

**Rezultat kroku:** pliki kompilują się (`bun run check`). Factory/metody mogą
rzucać `throw new Error('not implemented')` — to OK na tym etapie.

### Step 2: TEST domeny (RED)
**Co robimy:** W `src/domain/<context>/__tests__/<aggregate>.test.ts` napisz testy:
- Factory z poprawnym inputem → zwraca ok z prawidłowym agregatem (ma id, ma VO)
- Factory z pustym <pole> → zwraca err z `{ kind: '<unikalne>' }`
- Factory z nieprawidłowym <pole> → zwraca err z `{ kind: '<unikalne>' }`
- Value Object factory: poprawny input → branded type, niepoprawny → err
- Metoda biznesowa → sprawdza invariant (np. "hours nie mogą zmaleć")
- Sprawdź że KAŻDY error kind jest UNIKALNY (nie reużywaj)
Uruchom: `bun test` → testy MUSZĄ FAILOWAĆ (RED). Jeśli przechodzą bez
implementacji — testy są za słabe, popraw je.
**Rezultat kroku:** testy istnieją i FAILUJĄ. To jest prawidłowy stan.

### Step 3: Domain impl (GREEN)
**Co robimy:** Zaimplementuj factory i metody tak aby testy z Step 2 przeszły:
- Value Object factories: walidacja → branded type lub err
- Aggregate factory: tworzy pełny obiekt z `id: generateId()`, używa VO factories
  do walidacji pól, zwraca `Result<Aggregate, DomainError>`
- NIE parsuj `unknown` w domain factory — to robota warstwy application (Zod).
  Factory przyjmuje TYPOWANY input (już sparsowany), nie `unknown`.
- Metody biznesowe: chroni invarianty, zwraca nowy stan agregatu
Uruchom: `bun test` → testy MUSZĄ PRZECHODZIĆ (GREEN).
**Rezultat kroku:** `bun test` — zielone. `bun run check` — czyste.

### Step 4: DB schema (Drizzle)
**Co robimy:** W `src/infrastructure/db/schema/` dodaj/zmodyfikuj schemat:
- Tabela `<nazwa>`: kolumny <lista z typami>
- Relacje: <opis relacji>
Wygeneruj migrację: `bunx drizzle-kit generate`
Uruchom migrację: `bunx drizzle-kit migrate`
**Rezultat kroku:** migracja przechodzi bez błędów. Schemat odpowiada modelowi domeny.

### Step 5: Repository adapter
**Co robimy:** W `src/infrastructure/<context>/` zaimplementuj port z Step 1:
- `Drizzle<Nazwa>Repository implements <Nazwa>Repository`
- Mapowanie: DB row ↔ domain aggregate (NIE zwracaj surowych DB rows)
**Rezultat kroku:** adapter kompiluje się i implementuje wszystkie metody portu.

### Step 6: TEST use case (RED)
**Co robimy:** W `src/application/<context>/__tests__/<use-case>.test.ts` napisz testy:
- Utwórz `Fake<Nazwa>Repository` (in-memory, implementuje port)
- Test: poprawny input → `ok` + rekord w repo
- Test: nieprawidłowy input → `err` z odpowiednim błędem
- Test: <edge case specyficzny dla use case>
Uruchom: `bun test` → nowe testy FAILUJĄ (RED). Stare testy domeny wciąż GREEN.
**Rezultat kroku:** nowe testy istnieją i failują.

### Step 7: Application service (GREEN)
**Co robimy:** W `src/application/<context>/` utwórz use case:
- `<NazwaUseCase>` — orkiestruje: waliduj input (Zod) → wywołaj domain logic → zapisz przez port
- Input: <DTO/command z walidacją Zod>
- Output: `Result<ResponseDTO, AppError>`
Uruchom: `bun test` → WSZYSTKIE testy GREEN (domain + use case).
**Rezultat kroku:** `bun test` — zielone. Use case nie importuje infrastructure.

### Step 8: Route handler (Hono)
**Co robimy:** W `src/api/routes/` dodaj handler:
- `<METHOD> <path>` — CIENKI handler:
  1. Parsuj i waliduj input (Zod)
  2. Wywołaj use case
  3. Zmapuj Result na HTTP response
- Żadnej logiki biznesowej tutaj. Max ~20 linii.
**Request/Response:**
```
POST /api/<resource>
Body: { ... }
→ 201: { id: "...", ... }
→ 400: { error: "validation: ..." }
→ 401: { error: "Unauthorized" }
```
**Rezultat kroku:** endpoint odpowiada na request.

### Step 9: Frontend — custom hook + komponent prezentacyjny
**Co robimy:**
1. Hook `use<Feature>()` w `src/client/features/<feature>/use<Feature>.ts`:
   - fetch/mutacja, state, handlery akcji
   - Zwraca: `{ data, isLoading, error, <akcje> }`
   - ZERO logiki renderowania
2. Komponent `<Feature>Page.tsx` w tym samym katalogu:
   - Wywołuje hook na górze
   - Renderuje UI: Radix UI + Tailwind (z docs z Step 0)
   - ZERO logiki — żadnych fetch, żadnych obliczeń
   - Jeśli >100 linii — wydziel sub-komponenty
**Rezultat kroku:** strona renderuje się bez błędów w konsoli.

### Step 10: Final check — lint, typecheck, ALL tests
**Co robimy:** `bun run lint` + `bun run check` + `bun test`
**Rezultat:** ZERO errors, WSZYSTKIE testy zielone (domain + use case).
Jeśli coś failuje — wróć do odpowiedniego kroku i napraw.

## Out of scope (NIE rób tego)
- NIE refaktoruj istniejącego kodu który działa
- NIE dodawaj paginacji/sortowania/filtrowania (osobny feature)
- NIE implementuj auth jeśli feature tego nie wymaga
- NIE optymalizuj query (indexy — osobny task)
- NIE dodawaj animacji/transitions
- NIE aktualizuj dokumentacji

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
```
STUCK at Step <N>: <co próbowałeś, jaki błąd, jaka hipoteza>
```
Zakończ pracę. Człowiek zdecyduje.
````

---

## Reguły pisania planu

### 1. Vertical slice — cały stos per feature, nie per warstwa

Plan ZAWSZE idzie: domain → infra → API → UI dla jednego feature'a.
NIGDY: "zrób całą bazę danych", "zrób wszystkie endpointy", "zrób cały frontend".

Dlaczego: agent przy per-layer dryftuje — robi 10 tabel, zapomina po co, potem pisze
endpointy niezgodne ze schematem. Per-feature daje mu zamknięty kontekst.

### 2. TDD — test PRZED implementacją, nie po

To najważniejsza zmiana w tym skillu. Agent z testem na końcu (Step 8/9)
pomija go — "poniósł się" implementacją, uznał że typecheck wystarczy.

W TDD testy są Step 2 i Step 6 — w środku planu, nie na końcu. Agent
NIE MOŻE ich przeskoczyć, bo:
- Step 3 (domain impl) mówi "implementuj aż testy z Step 2 przejdą"
- Step 7 (use case impl) mówi "implementuj aż testy z Step 6 przejdą"

Bez testów nie wie kiedy skończył krok. Testy stają się kryterium stopu.

Dlaczego to działa z agentami:
- Agent ma twardy, mechaniczny checkpoint: `bun test` → RED/GREEN
- Nie musi oceniać "czy kod jest dobry" — test mu powie
- Nie może "zapomnieć" o testach — następny krok je wymaga

### 3. Domain layer ZAWSZE jako Step 1 (po docs)

Agent domyślnie zaczyna od "zrobię endpoint i DB schema" i wrzuca logikę do routera.
Wymuszając domain layer jako pierwszy krok, zmuszasz go do myślenia o agregatach,
value objects i invariantach ZANIM dotknie infrastruktury.

**Czym jest agregat:** granica transakcyjnej spójności, nie "kolekcja rzeczy".
Pytanie: "czy jest invariant wymagający sprawdzenia wielu X naraz?"
- Jeśli nie → X jest samodzielnym agregatem (np. Game jest aggregate root)
- Jeśli tak → X jest częścią większego agregatu (np. OrderLine wewnątrz Order)
- Kolekcja Game'ów NIE jest agregatem — to repozytorium.

**Czym jest Value Object:** typ z invariantami, bez tożsamości.
- GameTitle to VO (nie goły string) bo ma regułę "nie może być pusty"
- Email to VO bo ma regułę formatu
- Pole bez reguł (np. opcjonalny opis) może zostać stringiem — YAGNI

**Factory agregatu vs walidacja inputu:**
- Domain factory (`createGame`) przyjmuje TYPOWANY input, nie `unknown`
- Parsowanie `unknown` → DTO to robota warstwy application (Zod schema)
- Domain factory tworzy PEŁNY agregat z ID (generowane w domenie, np. UUID)

Jeśli logika jest trywialna (CRUD bez reguł) — napisz to wprost w planie:
"Ten feature to prosty CRUD — nie twórz domain service, wystarczy value objects + repository."
YAGNI, ale świadomy.

### 4. Route handler = max 20 linii

Wprost napisz w Constraints. Bez tego agent wrzuci walidację, logikę biznesową,
mapowanie DB i formatowanie response'a w jeden handler.

### 5. React: custom hook + prezentacja — zawsze osobno

Bez tego agent pisze `useEffect` + `fetch` + renderowanie w jednym pliku 300 linii.
Plan wymusza:
- `use<Feature>.ts` — hook z logiką (fetch, state, handlery)
- `<Feature>Page.tsx` — komponent który TYLKO wywołuje hook i renderuje

Hook zwraca czyste API: `{ data, isLoading, error, actions }`.
Komponent nie wie skąd dane się biorą.

### 6. Context7 per krok — nie tylko na starcie

Jeśli w Step 7 agent potrzebuje komponentu Radix którego nie pobrał w Step 0 —
plan powinien mówić: "Wróć do Step 0 i pobierz docs Radix Dialog".

Alternatywnie: w Constraints napisz regułę globalną:
"Zanim użyjesz API biblioteki — sprawdź czy masz docs z Context7. Jeśli nie — pobierz."

### 7. Nazewnictwo z domeny — wprost w planie

Napisz w planie: "Agregat nazywa się `Order`, nie `OrderManager` ani `OrderService`."
Agent generuje nazwy `XxxManager`, `XxxHandler` odruchowo — musi mieć explicit nazwy.

### 8. Dependency rule — wprost w Constraints

"NIE importuj infrastructure w domain." Bez tego agent zaimportuje `db` bezpośrednio
w agregatze. Napisz to wprost, bo to najczęstsza layer violation.

### 9. Definition of Done na górze

Agent decyduje o stopie na podstawie DoD. Jeśli jest na końcu — zapomni sprawdzić.

### 10. "If you get stuck" — max 2 próby

Agent potrafi próbować 10 razy tego samego. Sekcja STUCK zamyka pętlę po 2.

---

## Dostrajanie pod model

### Gemma 3/4 27B
- Plan **<4000 tokenów**. Skróć Context, ogranicz do 6-8 kroków.
- Dodaj do Constraints: "Odpowiadaj zwięźle. Wykonuj, nie komentuj."
- Context7: jeśli Ollama bez MCP — użyj CLI (`ctx7 docs`) albo wklej snippety API.

### Big Pickle / GLM-4.6 (OpenCode Zen)
- Plan do **~8k tokenów** OK — duży context.
- Max ~12 steps. Więcej → podziel na dwa plany.
- Komentarze/nazwy w kodzie po angielsku (gorszy multilingual).
- Context7 skonfigurowany w OpenCode — zakładaj że działa.

---

## Czego plan NIE naprawi

| Problem | Plan pomoże? | Prawdziwe rozwiązanie |
|---------|-------------|----------------------|
| Model pomija testy na końcu | ✅ | TDD — testy w środku planu, nie na końcu |
| Model pisze npm zamiast bun | ✅ | — |
| Model halucynuje Tailwind/Radix | ✅ częściowo | Context7 MCP w agencie |
| Model pisze monolit-komponent | ✅ | — |
| Model pisze anemic model | ✅ | — |
| Model miesza logikę z prezentacją | ✅ | — |
| Model nie zna API Drizzle v0.35 | ❌ | Context7 |
| Model generuje brzydki UI | ❌ | Daj Visual spec / użyj Radix + dobry Tailwind design system |
| Model nie radzi sobie z complex state | ❌ | Użyj mocniejszego modelu na ten step |
| Model ignoruje DDD mimo planu | ❌ | Model za słaby na tę architekturę → zredukuj DDD do minimum |

---

## Checklist przed oddaniem planu

- [ ] Plan jest vertical slice (jeden feature, cały stos)
- [ ] Step 0 (Context7) z konkretnymi pytaniami per biblioteka
- [ ] Runtime = Bun, wymieniony wprost z komendami
- [ ] TDD: testy domeny PRZED implementacją domeny (Step 2 → Step 3)
- [ ] TDD: testy use case PRZED implementacją use case (Step 6 → Step 7)
- [ ] Testy mają konkretne przypadki (happy path + min. 2 edge cases)
- [ ] Domain layer jest Step 1 (przed infra/API)
- [ ] Agregaty/VO/porty mają jawne nazwy z domeny
- [ ] Constraints: TDD, "logika w domenie", "NIE importuj infra w domain"
- [ ] Route handler: constraint max ~20 linii
- [ ] Frontend: oddzielny hook + oddzielny komponent prezentacyjny
- [ ] DoD jest NAD krokami, zawiera "testy zielone"
- [ ] Jest "If you get stuck" z limitem 2 prób
- [ ] Jest Out of scope (min. 3 pozycje)
- [ ] Nie ma nadmiarowych abstrakcji (YAGNI)
- [ ] Krok count: 8-12. Więcej → podziel.
