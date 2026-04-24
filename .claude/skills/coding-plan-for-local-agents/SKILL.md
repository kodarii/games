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
  wieloetapowego taska w innej sesji/agencie niż bieżąca rozmowa. Plany pisane są jako FAZY
  (osobne pliki po 3-4 kroki), vertical slice z DDD, TDD, separation of concerns w React,
  Context7 do docs, stack: Bun + Hono + Drizzle + Better-Auth + React + Radix + Tailwind.
  NIE używaj gdy plan jest dla człowieka-dewelopera ani gdy użytkownik prosi o implementację.
---

# Plan kodowania dla lokalnych coding agents

## Problem: agent gubi się przy >5 krokach

Lokalne modele (27B-klasa) realnie ogarniają 3-5 kroków. Plan z 10 krokami
= agent wykona pierwszą połowę dobrze, drugą pominie lub zepsuje.

Rozwiązanie: **fazy**. Zamiast jednego planu z 10 krokami, generuj 3 osobne pliki
po 3-4 kroki każdy. Każda faza to zamknięty mini-plan z własnym celem, Context7,
DoD i Constraints. Agent dostaje jedną fazę na raz, wykonuje, kończy. Potem
dostaje następną fazę z czystym kontekstem.

Fazy łączą się przez **artefakty** — faza 1 produkuje pliki na dysku, faza 2
je czyta (`Files to read`) i buduje na nich. Agent nie musi pamiętać co robił
w fazie 1 — widzi rezultat w kodzie.

---

## Stack projektu (domyślny)

**Backend:** Bun + HonoJS + Drizzle ORM + PostgreSQL + Better-Auth
**Frontend:** React + react-router-dom + Radix UI + Tailwind CSS
**Runtime/PM:** Bun (NIE Node.js, NIE npm)
**Architektura:** DDD, Ports & Adapters, vertical slicing per feature
**Zasady:** SOLID, DRY, YAGNI, TDD (test-first)

---

## Konsultuj się z innymi skillami PRZED pisaniem planu

Ty (Claude) masz dostęp do skilli eksperckich. Agent lokalny ich NIE MA — widzi
tylko treść pliku fazy. Dlatego ZANIM napiszesz fazy:

1. **Przeczytaj odpowiednie skille** — wczytaj ich SKILL.md i zastosuj wiedzę
2. **Przetraw wiedzę** — wyciągnij konkretne wytyczne istotne dla tego feature'a
3. **Osadź wytyczne w fazach** — wstaw je do Context/Constraints danej fazy
   jako krótkie, explicit instrukcje (nie referencje do skilli)

### Które skille konsultować i kiedy

| Faza | Skill | Kiedy | Co wyciągnąć do fazy |
|------|-------|-------|---------------------|
| PHASE 1 (domain) | `ddd-expert` | ZAWSZE | Czy to agregat czy VO? Jakie invarianty? Jaki wzorzec (specification, strategy)? Wstaw wynik analizy do Context fazy 1 jako sekcję "Domain design decisions" |
| PHASE 1 (domain) | `ddd-reviewer` | Jeśli feature rozbudowuje istniejącą domenę | Przeczytaj istniejący kod domenowy, zidentyfikuj problemy, wstaw do Constraints fazy 1: "NIE powtarzaj błędu X z istniejącego kodu" |
| PHASE 2 (backend) | `enterprise-web-expert` | ZAWSZE | Error handling pattern, auth flow, transaction boundaries. Wstaw do Constraints fazy 2 |
| PHASE 3 (frontend) | `ux-ui-expert` | ZAWSZE | Wygeneruj Visual spec z pomocą tego skilla. Wstaw gotowy opis layoutu, komponentów Radix, kolorów, spacing do fazy 3 |

### Jak to wygląda w praktyce

Użytkownik mówi: "zrób plan: dodaj zarządzanie zamówieniami"

Claude (planista) robi:
```
1. Czytam ddd-expert → analizuję: Order to aggregate root z OrderLine,
   invariant "min 1 pozycja", "suma = Σ pozycji". OrderStatus to VO z maszyną stanów.
2. Czytam enterprise-web-expert → decyduję: Result<T,E> na error handling,
   transakcja na zapis Order + Lines, idempotency key na endpoint tworzenia.
3. Czytam ux-ui-expert → projektuję Visual spec: tabela zamówień z statusem,
   formularz z dynamiczną listą pozycji, Radix Dialog na potwierdzenie.
4. Piszę 3 fazy z wbudowanymi wytycznymi z powyższych analiz.
```

### Co wstawiać do faz — format

W fazie dodaj krótką sekcję `## Design decisions` (max 5-8 linii) z wynikami
analizy. Agent nie musi wiedzieć SKĄD te decyzje — musi wiedzieć CO robić.

Przykład w PHASE_1_domain.md:
```markdown
## Design decisions
- Order to aggregate root. OrderLine jest częścią agregatu Order (nie samodzielną encją)
- Invariant: Order musi mieć min 1 pozycję. Pilnuj w `removeLine()` — err jeśli ostatnia
- OrderStatus: Draft → Confirmed → Shipped → Delivered. Nie ma cofania z Shipped
- Money to Value Object (amount + currency), nie goły number
- ID generowane w domenie: `OrderId = UUID`, nie auto-increment
```

Przykład w PHASE_2_backend.md:
```markdown
## Design decisions
- Error handling: Result<T, AppError> — nie wyjątki
- Zapis Order + OrderLines w jednej transakcji Drizzle (`db.transaction()`)
- Endpoint POST /api/orders — idempotency key w headerze (X-Idempotency-Key)
- Auth: Better-Auth session middleware na route, user_id z sesji (nie z body)
```

Przykład w PHASE_3_frontend.md:
```markdown
## Visual spec
**Layout:** Tabela zamówień (kolumny: #, data, status, kwota, akcje)
**Formularz:** Radix Dialog, dynamiczna lista pozycji (dodaj/usuń), Select na produkt
**Status badge:** zielony=Delivered, niebieski=Shipped, szary=Draft
**Mobile:** tabela → lista kart, formularz fullscreen
**Komponenty Radix:** Dialog, Select, Table (pobierz docs z Context7)
```

### WAŻNE: nie referencjonuj skilli w plikach faz

Agent lokalny NIE zna Twoich skilli. NIE pisz w fazie: "zgodnie z ddd-expert..."
ani "jak mówi enterprise-web-expert...". Wstaw KONKRETNE wytyczne, nie referencje.

**Źle:** "Zaprojektuj agregat zgodnie z zasadami DDD (patrz skill ddd-expert)"
**Dobrze:** "Order to aggregate root. OrderLine jest częścią Order. Invariant: min 1 pozycja."

---

## Zapis planów na dysk

Każdy feature generuje katalog z fazami w `docs/plans/`:

```
docs/plans/<feature-name>/
  PHASE_1_domain.md
  PHASE_2_backend.md
  PHASE_3_frontend.md
```

Nazwy: lowercase, kebab-case, bez polskich znaków. Użyj `create_file`.
Po zapisaniu — powiedz użytkownikowi ścieżki i krótko (1 zdanie per faza) co obejmują.

---

## Trzy fazy vertical slice

Każdy feature rozbijaj na 3 fazy. Agent wykonuje je kolejno, każdą w osobnej
sesji (czysty kontekst). Fazy łączą się przez pliki na dysku.

```
PHASE 1: Domain + testy          → produkuje: src/domain/<context>/*
PHASE 2: Infra + API + testy     → czyta domain, produkuje: src/infrastructure/*, src/api/*
PHASE 3: Frontend                → czyta API routes, produkuje: src/client/features/*
```

Jeśli feature nie ma frontendu — pomiń fazę 3.
Jeśli feature to prosty CRUD bez logiki — połącz fazę 1 i 2 w jedną.

---

## Szablon PHASE 1: Domain + testy (TDD)

````markdown
# <Feature> — Faza 1: Domain

## Goal
<1-2 zdania: co modelujemy w domenie, jakie invarianty chronimy>

## Definition of Done
- [ ] Testy domeny przechodzą: `bun test <ścieżka do testów>`
- [ ] Typecheck: `bun run check`
- [ ] Logika walidacji jest w Value Objects / factory, nie w gołych ifach

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun test`, `bun run check`)
**Architektura:** DDD — domain layer nie importuje infrastructure
**Error handling:** Result<T, E> pattern (`ok(value)` / `err(error)`)

## Design decisions
<Wyniki analizy z ddd-expert — jakie agregaty, VO, invarianty, wzorce.
Agent nie musi wiedzieć skąd te decyzje — musi wiedzieć CO robić.
Max 5-8 linii, konkretnie.>

### Relevant files (edit only these)
- `src/domain/<context>/<aggregate>.ts`
- `src/domain/<context>/__tests__/<aggregate>.test.ts`
- `src/domain/<context>/<port>.ts` — interfejs repozytorium

### Files to read but NOT edit
- `src/domain/shared/result.ts` — typ Result, funkcje ok/err

## Constraints
- TDD: NAJPIERW test (RED), POTEM implementacja (GREEN)
- NIE importuj nic z infrastructure / application / api
- NIE parsuj `unknown` — factory przyjmuje typowany input
- ID agregatu generowane w domenie (UUID), NIE auto-increment z bazy
- Każdy error kind UNIKALNY — NIE reużywaj tego samego kind na różne błędy
- Value Object na każde pole z invariantem (nie goły string/number)

## Steps

### Step 1: Typy + testy (RED)
**Co robimy:**
1. Utwórz typy: Value Object, Aggregate, DomainError, Port (interfejs repo)
2. Napisz testy factory i VO:
   - factory z poprawnym inputem → `ok` z agregatem (ma ID, ma VO)
   - factory z <niepoprawne pole> → `err({ kind: '<unikalne>' })`
   - <metoda biznesowa> jeśli jest → sprawdza invariant
3. `bun test` → RED (testy failują — to prawidłowe)
**Rezultat:** pliki istnieją, testy FAILUJĄ.

### Step 2: Implementacja domeny (GREEN)
**Co robimy:**
1. Zaimplementuj VO factories (walidacja → branded type lub err)
2. Zaimplementuj aggregate factory (generuje ID, używa VO factories)
3. Zaimplementuj metody biznesowe
4. `bun test` → GREEN
**Rezultat:** `bun test` zielone, `bun run check` czyste.

### Step 3: Port repozytorium
**Co robimy:** Zdefiniuj interfejs `<Nazwa>Repository` z metodami:
- `findById(id): Promise<Aggregate | null>`
- `save(aggregate): Promise<void>`
- <inne potrzebne>
**Rezultat:** interfejs kompiluje się. To TYLKO interfejs — implementacja w fazie 2.
````

---

## Szablon PHASE 2: Infra + API + testy (TDD)

````markdown
# <Feature> — Faza 2: Backend

## Goal
<1-2 zdania: jaki endpoint, co robi, jakie responses>

## Definition of Done
- [ ] Endpoint `<METHOD> <path>` zwraca poprawny response
- [ ] Testy use case przechodzą: `bun test <ścieżka>`
- [ ] Wszystkie testy (domain + use case): `bun test`
- [ ] `bun run check` + `bun run lint` czyste

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**ORM:** Drizzle. Migracje: `bunx drizzle-kit generate` + `bunx drizzle-kit migrate`
**Walidacja inputu:** Zod (parsowanie unknown → DTO w warstwie application)

## Design decisions
<Wyniki analizy z enterprise-web-expert — error handling, transakcje,
auth flow, idempotency. Max 5-8 linii, konkretnie.>

### Step 0: Pobierz dokumentację
Użyj Context7:
- Drizzle ORM: "<konkretne pytanie — np. insert with returning>"
- Hono: "<konkretne pytanie — np. route handler with json body>"
- Zod: "schema validation"

### Relevant files (edit only these)
- `src/infrastructure/db/schema/<tabela>.ts`
- `src/infrastructure/<context>/<repo-adapter>.ts`
- `src/application/<context>/<use-case>.ts`
- `src/application/<context>/__tests__/<use-case>.test.ts`
- `src/api/routes/<resource>.ts`

### Files to read but NOT edit
- `src/domain/<context>/` — typy, porty, logika z fazy 1
- `src/infrastructure/db/client.ts` — Drizzle client

## Constraints
- TDD: NAJPIERW test use case (RED), POTEM implementacja (GREEN)
- Route handler max ~20 linii — TYLKO: parsuj → wywołaj use case → response
- NIE wrzucaj logiki biznesowej do routera ani adaptera
- Repository adapter mapuje DB row ↔ domain aggregate (nie zwraca surowych rows)
- Parsowanie unknown → DTO przez Zod w application layer, NIE w domain

## Steps

### Step 1: DB schema + adapter
**Co robimy:**
1. Dodaj schemat Drizzle (tabela + kolumny + relacje)
2. `bunx drizzle-kit generate` + `bunx drizzle-kit migrate`
3. Zaimplementuj `Drizzle<Nazwa>Repository implements <Nazwa>Repository`
4. Mapowanie: DB row ↔ domain aggregate
**Rezultat:** migracja OK, adapter kompiluje się.

### Step 2: Test use case (RED)
**Co robimy:**
1. Utwórz `Fake<Nazwa>Repository` (in-memory, implementuje port)
2. Napisz testy:
   - poprawny input → `ok` + rekord w fake repo
   - niepoprawny input → `err`
   - <edge case>
3. `bun test` → nowe testy RED, stare (domain) GREEN
**Rezultat:** testy use case istnieją i FAILUJĄ.

### Step 3: Use case + route handler (GREEN)
**Co robimy:**
1. Zaimplementuj use case: Zod parse → domain logic → save via port
2. Dodaj route handler: parsuj request → wywołaj use case → response
3. `bun test` → ALL GREEN
**API spec:**
```
<METHOD> <path>
→ 201: { ... }
→ 400: { error: "..." }
```
**Rezultat:** endpoint działa, `bun test` zielone, `bun run check` czyste.
````

---

## Szablon PHASE 3: Frontend

````markdown
# <Feature> — Faza 3: Frontend

## Goal
<1-2 zdania: jaka strona/komponent, co użytkownik widzi i może zrobić>

## Definition of Done
- [ ] Strona renderuje się bez błędów w konsoli
- [ ] Logika w custom hooku, komponent TYLKO prezentacyjny
- [ ] `bun run check` + `bun run lint` czyste

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**UI:** Radix UI + Tailwind CSS — NIE pisz klas z pamięci, pobierz docs

### Step 0: Pobierz dokumentację
Użyj Context7:
- Radix UI: "<konkretny komponent — Dialog, Select, etc.>"
- Tailwind CSS: "<konkretne klasy — grid, flex, spacing>"

### Relevant files (edit only these)
- `src/client/features/<feature>/use<Feature>.ts`
- `src/client/features/<feature>/<Feature>Page.tsx`
- `src/client/features/<feature>/components/` — sub-komponenty jeśli >100 linii

### Files to read but NOT edit
- `src/api/routes/<resource>.ts` — żeby znać API endpoint (method, path, request/response)
- `src/client/lib/api.ts` — istniejące fetch functions

## Visual spec
<Zaprojektowany z pomocą ux-ui-expert — dokładny opis layoutu, komponentów
Radix, spacing, kolorów, responsywności. Agent widzi gotowy spec, nie musi
projektować sam.>
**Layout:** <dokładny opis>
**Kluczowe elementy:**
- <element> — <co wyświetla, jakie interakcje, jaki komponent Radix>
**Responsywność:** <breakpointy, co się zmienia na mobile>
**Design tokens:** <kolory statusów, spacing, typografia jeśli niestandardowe>

## Constraints
- NIE koduj Tailwind/Radix z pamięci — TYLKO z docs z Step 0
- NIE wrzucaj logiki do komponentu — logika w hooku
- NIE pisz custom CSS — Tailwind utility classes only
- Jeśli komponent >100 linii — wydziel sub-komponenty

## Steps

### Step 1: Custom hook
**Co robimy:**
1. `use<Feature>()` — fetch/mutacja, state, handlery
2. Zwraca: `{ data, isLoading, error, <akcje> }`
3. ZERO logiki renderowania
**Rezultat:** hook kompiluje się, eksportuje czyste API.

### Step 2: Komponent prezentacyjny
**Co robimy:**
1. `<Feature>Page.tsx` — wywołuje hook, renderuje UI
2. Użyj Radix + Tailwind ZGODNIE z docs z Step 0
3. ZERO logiki — żadnych fetch, obliczeń, transformacji
**Rezultat:** strona renderuje się bez błędów.

### Step 3: Sprawdź
**Co robimy:** `bun run check` + `bun run lint`
**Rezultat:** zero errors.
````

---

## Reguły pisania fazowych planów

### 1. Max 3-4 kroki per fazę

Agent ogarnia 3-5 kroków. 3-4 to sweet spot — wystarczająco dużo na zamkniętą
jednostkę pracy, wystarczająco mało żeby nie dryfować. Jeśli faza ma 5+ kroków
— rozbij ją na dwie pod-fazy.

### 2. Każda faza ma własny Context7 (Step 0)

Faza 2 potrzebuje docs Drizzle i Hono. Faza 3 potrzebuje docs Radix i Tailwind.
NIE zakładaj że agent pamięta docs z poprzedniej fazy — ma czysty kontekst.

### 3. Fazy łączą się przez pliki, nie przez pamięć

Faza 2 czyta `src/domain/` (output fazy 1). Faza 3 czyta `src/api/routes/`
(output fazy 2). Sekcja "Files to read but NOT edit" to jest handoff.

Agent nie musi pamiętać co było wcześniej — widzi rezultat w kodzie na dysku.

### 4. TDD w fazach 1 i 2, nie w 3

- Faza 1: test domeny → impl domeny (RED → GREEN)
- Faza 2: test use case → impl use case + route (RED → GREEN)
- Faza 3: bez testów (UI testy to osobny temat, nie wymuszaj)

Testy są PRZED implementacją w obrębie fazy — agent nie może ich pominąć,
bo następny krok mówi "implementuj aż testy przejdą".

### 5. Context — krótki, tylko to co ta faza potrzebuje

Faza 1 nie musi wiedzieć o Hono, Drizzle, Tailwind.
Faza 3 nie musi wiedzieć o DB schema ani Zod.
Im mniej w Context — tym więcej kontekstu agent ma na kod.

### 6. DoD — specyficzne per fazę

Faza 1 DoD: "testy domeny zielone + typecheck". Nie sprawdza endpointu.
Faza 2 DoD: "endpoint zwraca 201 + testy zielone". Nie sprawdza UI.
Faza 3 DoD: "strona renderuje się + lint clean". Nie sprawdza domeny.

### 7. Vertical slice — wciąż obowiązuje

Fazy to nie "warstwa po warstwie". To vertical slice **rozbity na etapy**.
Cały czas robimy JEDEN feature. Tylko dajemy agentowi mniejsze kawałki.

### 8. Czym jest agregat — przewodnik dla planisty

Agregat = granica transakcyjnej spójności, NIE kolekcja obiektów.
- Pytanie: "czy jest invariant wymagający sprawdzenia wielu X naraz?"
- Tak → X jest częścią większego agregatu (np. OrderLine wewnątrz Order)
- Nie → X jest samodzielnym aggregate root (np. Game jest sam agregatem)
- Kolekcja Game'ów to repozytorium, NIE agregat
- Value Object = typ z invariantami, bez tożsamości (np. GameTitle, Email)
- Factory agregatu tworzy PEŁNY obiekt z ID, nie DTO-bez-id
- Parsowanie `unknown` to Zod w application layer, nie domain factory

### 9. "If you get stuck" — w KAŻDEJ fazie

Każda faza kończy się sekcją:
```
## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>
Zakończ pracę.
```

---

## Dostrajanie pod model

### Gemma 3/4 27B
- Max 3 kroki per fazę. Dodaj: "Odpowiadaj zwięźle. Wykonuj, nie komentuj."
- Context7: jeśli brak MCP — wklej snippety API w Context jako code fence.

### Big Pickle / GLM-4.6 (OpenCode Zen)
- 4 kroki per fazę OK. Bogatszy Context dozwolony.
- Komentarze/nazwy po angielsku.

---

## Czego plan NIE naprawi

| Problem | Plan pomoże? | Rozwiązanie |
|---------|-------------|-------------|
| Agent pomija kroki (za dużo naraz) | ✅ | Fazy po 3-4 kroki |
| Agent pomija testy na końcu | ✅ | TDD — testy przed impl w fazie |
| Agent pisze npm zamiast bun | ✅ | Explicit runtime w Context |
| Agent halucynuje Tailwind/Radix | ✅ częściowo | Context7 w fazie 3 |
| Agent pisze anemic model | ✅ | VO + factory w fazie 1 |
| Agent miesza logikę z prezentacją | ✅ | Hook + komponent w fazie 3 |
| Agent nie zna API Drizzle | ❌ | Context7 MCP w agencie |
| Agent generuje brzydki UI | ❌ | Visual spec + Radix |
| Agent ignoruje DDD | ❌ | Model za słaby → uprość |

---

## Checklist przed oddaniem

- [ ] Skonsultowano z ddd-expert (faza 1: agregaty, VO, invarianty)
- [ ] Skonsultowano z enterprise-web-expert (faza 2: error handling, auth, transakcje)
- [ ] Skonsultowano z ux-ui-expert (faza 3: Visual spec, komponenty Radix)
- [ ] Wyniki konsultacji wstawione jako "Design decisions" w fazach (nie referencje)
- [ ] Feature rozbity na 2-3 fazy (nie jeden wielki plan)
- [ ] Każda faza ma max 3-4 kroki
- [ ] Każda faza ma własny Context7 (Step 0) z konkretnymi pytaniami
- [ ] Każda faza ma własny DoD (specyficzny, nie ogólny)
- [ ] Runtime = Bun wymieniony w KAŻDEJ fazie
- [ ] Fazy łączą się przez "Files to read" (nie przez pamięć agenta)
- [ ] TDD w fazie 1 i 2: test (RED) → impl (GREEN)
- [ ] Faza 1: VO z branded types, factory z ID, unique error kinds
- [ ] Faza 2: Zod w application, route handler max 20 linii
- [ ] Faza 3: hook + komponent osobno, Visual spec z ux-ui-expert
- [ ] "If you get stuck" w każdej fazie
- [ ] Pliki zapisane w `docs/plans/<feature>/PHASE_N_<nazwa>.md`
