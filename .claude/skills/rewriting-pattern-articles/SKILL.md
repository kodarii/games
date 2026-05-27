---
name: rewriting-pattern-articles
description: Use when rewriting, polishing, or auditing articles in `docs/patterns/` (files `NN-name.md`) so they teach a design pattern to a learner with knowledge gaps. Activates for requests like "popraw artykuł #N", "przerob plik patterns/...", "ten wzorzec jest słabo wyjaśniony", or batch passes over `docs/patterns/`.
---

# Rewriting Pattern Articles (docs/patterns/)

## Po co istnieje

Artykuły w `docs/patterns/01..36` mają uczyć wzorca projektowego osobę, która **może mieć braki w wiedzy** — w stylu zbliżonym do https://refactoring.guru/design-patterns, ale osadzonym w realnym kodzie tego repo. Pliki #01, #02 i #03 są **kanonicznymi przykładami** docelowej jakości i struktury. Każdy kolejny przerabiany plik MUSI dorównać im jakością dydaktyczną.

Skill zbiera empirycznie zweryfikowane lekcje (3 iteracje + recenzja użytkownika): czego artykuły NIE mogą pomijać, jaką strukturę mają trzymać, co z oryginału MUSI przeżyć.

## Kiedy używać

- Użytkownik prosi o przeredagowanie konkretnego pliku `docs/patterns/NN-name.md`
- Użytkownik pyta „dlaczego ten wzorzec jest tak słabo wyjaśniony" / „przeczytałem i nadal nie rozumiem"
- Batch-pass po wielu plikach z katalogu `docs/patterns/`
- Tworzenie nowego artykułu w tym katalogu (rzadziej — głównie do polerowania)

## Kanonika

**Zawsze przeczytaj pliki #01, #02 i #03 przed przerobieniem kolejnego.** To są wzorce docelowe.

- `docs/patterns/01-hexagonal-ports-adapters.md` — pełna struktura, analogia gniazdko/wtyczka, słowniczek, plusy/minusy
- `docs/patterns/02-aggregate-root.md` — przykład jak wyjaśnić **różnicę między pokrewnymi terminami** (aggregate vs aggregate root) i **kompozycję wizualną** (root + encje + VO)
- `docs/patterns/03-layered-architecture.md` — przykład jak wyjaśnić **różnicę od pokrewnego wzorca** (vs Hexagonal, vs N-tier) i **przepływ runtime**

## Standardowa struktura sekcji

Kolejność stała. Każdy artykuł ma pierwszą linię `# Wzorzec N — Nazwa Wzorca` (nie ruszać).

1. **Esencja (Intent)** — 1-2 zdania, czysta esencja
2. **Problem** — narracyjny scenariusz; lista *objawów bólu* (konkretne, nie generyczne)
3. **Rozwiązanie** — pomysł, bez kodu jeszcze
4. **Z czego składa się [wzorzec]** *(WARUNKOWA — patrz „Test #1" niżej)* — jeśli wzorzec ma pokrewne terminy lub kompozycję wewnętrzną, DODAĆ tę sekcję między „Rozwiązaniem" a „Analogią"
5. **Analogia z życia: [konkretna nazwa]** — 2-4 akapity, JEDNA analogia, z mapowaniem 1:1
6. **Struktura** — diagram ASCII + opis każdego elementu
7. **Czym to różni się od [pokrewny wzorzec]** *(WARUNKOWA — patrz „Test #2" niżej)*
8. **Przepływ w runtime** *(WARUNKOWA — gdy wzorzec ma sekwencję wywołań, np. request/response, lifecycle)*
9. **Jak wygląda w tym repo** — KONKRETNY kod z odnośnikami do plików (`apps/api/src/.../file.ts:42`)
10. **Kiedy stosować** — listy "stosuj gdy" / "nie stosuj gdy"
11. **Plusy i minusy** — dwie listy ✓ / ✗ z konkretami, NIE generykami
12. **Pułapki i warianty** — częste błędy implementacyjne + warianty wzorca
13. **Relacje z innymi wzorcami** — linki "Wzorzec #N — ...", konkretnie czemu się odnoszą

### Test #1 — Czy potrzebna jest sekcja „Z czego składa się…"

Pytanie: **Czy wzorzec wprowadza więcej niż jedno pojęcie, których czytelnik może NIE odróżniać?**

Przykłady wymagające osobnej sekcji:
- Aggregate Root: agregat vs aggregate root vs entity vs value object → **wymaga**
- Circuit Breaker: closed / open / half-open + reset → **wymaga** (te trzy stany + przejścia)
- Optimistic Locking: optimistic vs pessimistic + version vs timestamp → **wymaga**
- Use Case (Interactor): use case vs service vs controller vs handler → **wymaga**

Gdy wymagana — zawiera:
- Definicję każdego pojęcia osobno, w jednym zdaniu
- Przykład z repo (z odnośnikiem do pliku) lub jasne „w tym repo tego nie ma, bo X"
- **Diagram ASCII kompozycji** (gdzie pasują do siebie, kto trzyma referencję do kogo)
- Regułę kciuka: „X to Y, kiedy Z" w jednej linii

### Test #2 — Czy potrzebna jest sekcja „Czym to różni się od…"

Pytanie: **Czy ten wzorzec jest łatwo pomylić z innym wzorcem z tej listy 36?**

Przykłady wymagające:
- Layered (#3) ↔ Hexagonal (#1) ↔ N-tier (klasyczny, nie z listy) — **wymaga**
- Repository (#7) ↔ DAO (klasyczny) — **wymaga** krótkiej noty
- Optimistic Locking (#8) ↔ Pessimistic Locking — **wymaga**
- Unit of Work (#13) ↔ Transaction Script — **wymaga**
- Idempotency-Key (#15) ↔ Deduplication ↔ Retry-Safe — **wymaga**
- Circuit Breaker (#17) ↔ Retry ↔ Rate Limiter (#16) — **wymaga**

Gdy wymagana — pokazuje 3-4 wzorce ułożone obok siebie, z jednym zdaniem czym się różnią w kierunku zależności / odpowiedzialności.

## Twarde wymagania (każdy plik)

### Co MUSI przeżyć z oryginału (1:1)

- **Wszystkie odnośniki do plików** typu `apps/api/src/.../file.ts:42` — nie zmieniaj, nie skracaj
- **Wszystkie fragmenty kodu produkcyjnego** — nie zastępuj generycznym pseudokodem
- **Wszystkie cytaty z literatury** (Evans, Vernon, Fowler, Hohpe…)
- **Diagramy ASCII** już obecne — zachowaj, możesz rozszerzyć
- **Wszystkie merytoryczne pułapki** i wszystkie warianty

### Co MUSI być dodane (jeśli nie ma)

- **Callout „Słowniczek"** (`> **Słowniczek**` blockquote) z definicjami terminów technicznych użytych w tekście. Sekcja `Z czego składa się` lub `Analogia` to dobre miejsce na umieszczenie go.
- **Analogia z życia** — 2-4 akapity, JEDNA dobrana analogia, z jawnym mapowaniem element-do-elementu w punktorach na końcu sekcji
- **Plusy i minusy** jako listy ✓ / ✗ (nie rozsiane po tekście) — wyciągnij z istniejących akapitów
- **Esencja / Problem / Rozwiązanie** rozdzielone na trzy osobne sekcje, jeśli oryginał ma je w jednym akapicie

### Co MUSI być spełnione formalnie

- Język: **polski**. Terminy techniczne („port", „adapter", „aggregate root", „use case", „repository") zostają w oryginale.
- **Bez emoji**, chyba że są w oryginale (✓/✗ w plusach-i-minusach to wyjątek konwencjonalny)
- **Bez podsumowania na końcu** w stylu „we have learned that…". Sekcja kończąca to „Relacje z innymi wzorcami".
- Nadpisz plik w miejscu. Nie twórz nowych plików.

## Wybór analogii — co działa

Analogia jest sercem dydaktyki refactoring.guru. Zła analogia jest gorsza niż brak.

**Dobra analogia ma:**
- Konkretne fizyczne / codzienne obiekty (nie abstrakcje)
- Mapowanie 1:1 do pojęć wzorca, weryfikowalne („paragon = root, pozycja = encja podrzędna, cena = VO")
- Możliwość pokazania *czego nie wolno* w analogii (kelner nie wchodzi do kasy z luźną pozycją)
- 2-4 akapity rozwinięcia (nie zdanie, nie esej)

**Dobre kierunki dla typowych rodzin wzorców:**
- **Hexagonal, Repository, Port/Adapter** → gniazdko + wtyczka + adapter podróżny
- **Aggregate Root** → paragon w restauracji, akt notarialny, formularz urzędowy
- **Layered Architecture** → kuchnia w restauracji (sala/kelner/kucharz/dostawca)
- **Use Case (Interactor)** → kontuar w urzędzie, dyspozytor 112
- **Result/Either** → list polecony z potwierdzeniem odbioru (sukces) lub awizo (błąd)
- **Optimistic Locking** → wikipedia/google docs (kto pierwszy zapisze, drugi dostaje konflikt)
- **Idempotency-Key** → numer paragonu w sklepie (drugi raz tego samego nie zaksięguje)
- **Circuit Breaker** → bezpiecznik domowy (zerwany obwód, reset, próbny prąd)
- **Rate Limiter** → bramki na metrze (przepuszcza X osób na minutę)
- **DTO + Mapper** → tłumacz przysięgły między dwoma kancelariami prawnymi
- **DI / Composition Root** → montaż kuchni — projektant nie produkuje szafek, składa z gotowych
- **Decorator (caching)** → sekretarka, która pamięta odpowiedzi i nie zawsze pyta szefa
- **Holder / Hot-Swap** → kierownictwo restauracji (zmiana szefa kuchni nie zatrzymuje serwisu)
- **Token Storage z refresh** → karnet wstępu z datą ważności i automatycznym przedłużaniem
- **Cron + Leader Lease** → dyżur w szpitalu — jeden lekarz na zmianie, kartka z nazwiskiem na drzwiach
- **GC / Reconciliation** → magazynier porównujący listę towarów z półkami raz dziennie
- **IDOR-safe scoping** → zamek hotelowy — karta otwiera tylko ten pokój, na który została wydana
- **AES-GCM Cipher** → koperta + plomba + odcisk lakowy (szyfrowanie + integralność)
- **CORS / Origin Guard** → ochroniarz na bramce — wpuszcza tylko z listy
- **Request-scoped Logger** → identyfikator pacjenta na bransoletce w szpitalu (każda notatka go ma)

Jeśli wzorzec nie jest na liście — dobierz świadomie z reguł powyżej. Odrzuć analogie zbyt abstrakcyjne („to jak życie") lub takie, w których nie da się zmapować ról.

## Słowniczek — kiedy i co

Callout `> **Słowniczek**` jest **obowiązkowy**, jeśli artykuł używa choćby jednego z poniższych terminów:

- Anti-corruption layer (ACL)
- Dependency Inversion Principle (DIP)
- Aggregate / Aggregate Root / Entity / Value Object / Invariant
- Consistency boundary / Transactional boundary
- Command object / DTO / Anemic domain model
- Result / Either / Discriminated union
- Single-flight / Idempotent / At-most-once / Exactly-once
- Backpressure / Circuit breaker / Open/Closed/Half-open
- Optimistic / Pessimistic locking
- Bounded context

Definicja w słowniczku ma być **jednozdaniowa**, plus *przykład z repo* (gdy występuje).

## Test akceptacji (przed nadpisaniem pliku)

Zanim zwrócisz wynik, **sprawdź każdy z punktów**. Jeśli któryś nie jest spełniony — popraw, NIE wysyłaj.

1. Pierwsza linia to `# Wzorzec N — ...` (nie zmieniona)
2. Sekcje w kolejności z listy (z dozwolonymi warunkowymi)
3. Test #1 — czy potrzebna sekcja „Z czego składa się" — przeszedłeś świadomie?
4. Test #2 — czy potrzebna sekcja „Czym to różni się od" — przeszedłeś świadomie?
5. Analogia jest rozwinięta na 2-4 akapity z mapowaniem 1:1
6. Wszystkie odnośniki `file.ts:NN` z oryginału są obecne (po prostu policz)
7. Słowniczek obecny, jeśli wymagany (patrz lista terminów)
8. Plusy i minusy jako dwie listy ✓ / ✗ (nie rozsiane po tekście)
9. Język polski, bez emoji (poza ✓/✗), terminy techniczne po angielsku
10. Brak narracyjnego „podsumowania" na końcu (kończy „Relacje z innymi wzorcami")

## Czego NIE robić

- Nie pisać „w tym artykule omówimy…" / „podsumowując…" — refactoring.guru tego nie ma, tutaj też nie
- Nie tłumaczyć terminów technicznych na polski („repository" zostaje, nie „repozytorium" jeśli kod tak nie nazywa)
- Nie zmieniać interpretacji merytorycznej oryginału — jeśli oryginał mówi „w tym repo robimy X, bo Y", to tak zostaje
- Nie wymyślać kodu, którego nie ma w repo. Jeśli odwołujesz się do nieistniejącego pliku — wyciąłeś sobie wiarygodność.
- Nie przerabiać kodu produkcyjnego na generyczny pseudokod
- Nie dodawać nowych zewnętrznych źródeł (linki, książki) — używaj tylko tych, które oryginał wspomina

## Format dispatchu agenta (przez Agent tool)

Gdy używasz tego skilla przez agenta, brief MUSI zawierać:

1. Pełną ścieżkę do pliku do przerobienia
2. Wskazanie: **„Najpierw przeczytaj `docs/patterns/01-hexagonal-ports-adapters.md`, `02-aggregate-root.md` i `03-layered-architecture.md` jako wzorzec docelowy"**
3. Wyniki Testu #1 i Testu #2 wykonane przez Ciebie (Claude rodzic) — przekaż agentowi, czy daje sekcję „Z czego się składa" / „Czym się różni od"
4. Konkretne pojęcia do uwzględnienia w słowniczku (lista terminów z tego artykułu)
5. Sugerowaną analogię (z listy „Dobre kierunki" lub uzasadnione własne)
6. Format wyniku: nadpisać plik, zwrócić listę sekcji + analogię + co z oryginału przeżyło

## Iteracyjny tryb po review

Jeśli użytkownik daje review po przeredagowaniu i wskazuje konkretną lukę (np. „nie rozumiem, czym X różni się od Y"), to:

- **NIE przepisuj całego pliku.** Wskaż lukę, odpal agenta z dyrektywą *dodaj / wzmocnij konkretną sekcję*, zachowując resztę.
- Agent ma **przeczytać aktualny stan pliku** i **dorzucać/wzmacniać**, nie zaczynać od zera.
- Typowe luki, które wracają w review:
  - „nie odróżniam X od Y" → dodaj/rozwiń callout `> **X ≠ Y**` w sekcji „Rozwiązanie" + sekcję „Z czego składa się"
  - „gdzie tu są encje / pola / części" → dodaj diagram ASCII kompozycji w sekcji „Z czego składa się"
  - „nie rozumiem, jak to się różni od wzorca N" → dodaj sekcję „Czym to różni się od wzorca N"
  - „nie widzę, jak to działa w czasie / od requestu do odpowiedzi" → dodaj sekcję „Przepływ w runtime"

## Lista wszystkich 36 wzorców

Spis znajduje się w `docs/patterns/README.md`. Każdy wzorzec ma plik `NN-slug.md`. Przy odnoszeniu się do innego wzorca z artykułu, używaj formy „Wzorzec #N — Nazwa" (jak w plikach #01-#03).
