---
name: writing-new-pattern-article
description: Use when the user asks to write a brand-new article in `docs/patterns/` from the README backlog (pozycje 37–156). Activates for prompts like „napisz kolejny wzorzec z backlogu", „opisz wzorzec #N", „wybierz pierwszy nieopisany i go napisz", „dodaj artykuł o Bounded Context". Nie używać do redagowania istniejących plików — to robi `rewriting-pattern-articles`.
---

# Writing New Pattern Articles (docs/patterns/)

## Po co istnieje

`docs/patterns/README.md` ma dwie części:
- **Opisane wzorce 1–36** — każdy ma własny plik `NN-slug.md`
- **Backlog 37–156** w sekcjach G–W — pozycje *nieopisane*, czekające na artykuł

Ten skill służy do **napisania nowego artykułu z backlogu od zera**, w stylu identycznym jak `01-hexagonal-ports-adapters.md`, `02-aggregate-root.md`, `03-layered-architecture.md`.

Skill `rewriting-pattern-articles` (osobny) zajmuje się **redagowaniem istniejących** plików. Nie myl ich.

**REQUIRED BACKGROUND:** Strukturę docelową, „Test #1 / Test #2", listę dobrych analogii, regułę słowniczka i test akceptacji definiuje skill `rewriting-pattern-articles`. **Ten skill ich nie powtarza** — używa ich 1:1. Otwórz ten skill, jeśli nie pamiętasz konkretnych reguł.

## Kiedy używać

- „Napisz kolejny wzorzec z backlogu"
- „Opisz wzorzec #N" (gdy N ≥ 37)
- „Wybierz pierwszy nieopisany wzorzec i go napisz"
- „Dodaj artykuł o [nazwa wzorca z backlogu]"

NIE używać gdy:
- N ≤ 36 (plik istnieje → użyj `rewriting-pattern-articles`)
- Użytkownik prosi o przerobienie istniejącego pliku
- Użytkownik prosi o nowy wzorzec, którego nie ma w README — najpierw dopisz go do backlogu, dopiero potem ten skill

## Krok po kroku

### 1. Wybór wzorca

Domyślnie: **pierwszy nieopisany według kolejności numerów w README** (najniższy numer w backlogu G–W bez odpowiadającego pliku).

```bash
# wzorce już opisane:
ls docs/patterns/ | grep -E '^[0-9]+-' | sort -t- -k1,1n
# pełna lista z backlogiem:
grep -E '^[0-9]+\. \*\*' docs/patterns/README.md
```

Jeśli użytkownik wskazał konkretne #N lub konkretną nazwę — bierz tę.

### 2. Decyzja kluczowa: czy wzorzec **występuje w tym repo**

To największa różnica względem `rewriting-pattern-articles` — tam wszystkie 36 wzorców demonstrowalnie są w kodzie. W backlogu jest mieszanka, więc artykuł może mieć jedną z **trzech form**:

| Stan | Sekcja w artykule | Kiedy |
|------|-------------------|-------|
| **Występuje w repo** | „Jak wygląda w tym repo" + `file.ts:NN` jak w #01–03 | Service Layer, Money, Health Check API itp. |
| **Występuje częściowo** | „Jak wygląda w tym repo (częściowo)" + akapit „Czego brakuje względem klasycznej formy" | Domain Event bez bus'a, Outbox bez relay'a itp. |
| **Nie występuje** | „Przykład" — realistyczny kod spoza repo + jedno-akapitowa notka „Czemu nie ma tego w tym repo" | Event Sourcing, CQRS, Saga, Sidecar itp. |

Audyt obecności:

```bash
# szukaj substancji, nie tylko nazwy
rg -l "<słowo-klucz>" apps/api/src apps/client/src
# np. Event Sourcing → "events", "apply(", "replay", "snapshot"
# np. Saga → "compensate", "compensation", "saga"
# np. CQRS → "command", "query", "readModel", "projection"
```

#### Forma A — wzorzec w repo

Pełne `file.ts:NN`, jak w #01–03. Bez zmian względem reguł z `rewriting-pattern-articles`.

#### Forma B — częściowa obecność

Pokaż co jest (`file.ts:NN`), wskaż co brakuje względem klasycznej formy. Bez zmyślania ścieżek.

#### Forma C — brak w repo

Zamiast wymyślać hipotetyczne pliki:

1. **Pokaż realistyczny przykład** — krótki, kompletny snippet (≤40 linii), w stacku **pasującym stylistycznie do repo** (TypeScript + Hono/Drizzle dla backendu, React + TanStack Query dla frontu), żeby czytelnik nie musiał przełączać paradygmatu. Może być z innego projektu open source (z atrybucją: „przykład wzorowany na X — link") lub syntetyczny.
2. **Jeden akapit „Czemu nie ma tego w tym repo"** — krótkie uzasadnienie (skala, monolit, brak event bus'a, niezasadne dla tego domenu). 2–4 zdania, nie cały rozdział.
3. **Opcjonalnie:** „Co by się zmieniło, gdyby się pojawił" — wskazanie miejsc w `apps/api/src/...` które wymagałyby zmiany (jeśli ma to sens dydaktyczny, np. dla CQRS warto pokazać który agregat by się rozdzielił).

**Nie zmyślaj plików z tego repo.** Każdy `file.ts:NN` musi istnieć (zweryfikuj `rg`-iem). Przykład spoza repo zaznacz wyraźnie — komentarz `// przykład poglądowy, nie z tego repo` na pierwszej linii bloku kodu lub nagłówek sekcji „Przykład (poglądowy)".

### 3. Nazwa pliku

Format: `NN-slug.md`, gdzie:
- `NN` = numer z README (37–156)
- `slug` = kebab-case nazwy, krótko, po angielsku (terminy techniczne)

Przykłady:
- #37 Bounded Context → `37-bounded-context.md`
- #44 Anti-Corruption Layer → `44-anti-corruption-layer.md`
- #67 Transaction Script → `67-transaction-script.md`

### 4. Pisanie artykułu

Pierwsza linia: `# Wzorzec N — Nazwa Wzorca` (gdzie N to numer z README, Nazwa po polsku jeśli ma utrwalone tłumaczenie, w przeciwnym razie po angielsku).

Struktura sekcji, Test #1, Test #2, słowniczek, analogia, plusy/minusy, test akceptacji — **bez wyjątku te same co w `rewriting-pattern-articles`**. Nie powtarzam ich tu. Sprawdź ten skill przed napisaniem.

Trzy odstępstwa specyficzne dla *nowego* artykułu:

#### 4a. „Jak wygląda w tym repo" / „Przykład" — zależnie od audytu kroku 2

Decyzja zapadła w kroku 2 (forma A / B / C). Trzymaj się jej spójnie w całym artykule — np. analogia i sekcja „Pułapki" powinny pasować do przykładu, który pokazałeś.

#### 4b. Źródło literaturowe

Zacytuj **dokładnie to źródło, które jest w backlogu w README** (np. „Evans, *DDD*, cz. IV, r. 14"). Cytat ma być w sekcji „Esencja" albo „Rozwiązanie" jako 1–2 linijkowy fragment lub parafraza.

**Jeśli nie znasz wzorca dostatecznie dobrze** (nie pamiętasz definicji, nie wiesz jak wygląda kanoniczny przykład, nie jesteś pewien historii / motywacji / pułapek) — **NIE zgaduj**. Szukaj w internecie zanim zaczniesz pisać:

1. **`WebFetch`** na link ze źródła w backlogu, jeśli jest URL (np. `microservices.io/patterns/...`, `martinfowler.com/...`, MDN, RFC, dokumentacja oficjalna).
2. **`context7`** dla bibliotek/frameworków (React, TanStack Query, Drizzle, Hono itp.) — zawsze gdy wzorzec jest osadzony w konkretnej technologii.
3. **`WebSearch`** dla wszystkiego innego — szczególnie gdy źródło w backlogu to książka bez linku (PoEAA, EIP, IDDD, *Release It!*). Szukaj fraz typu „Pattern Name canonical example", „Pattern Name Fowler", „Pattern Name vs alternatywa".

**Każdy fakt spoza Twojej pewnej wiedzy musi mieć źródło w artykule.** Dotyczy to:
- definicji / historii wzorca („Young wprowadził CQRS w 2010…")
- konkretnych liczb / dat / autorów
- cytatów z książek / dokumentacji
- twierdzeń „w praktyce X używa się tak" — czyje to praktyki?

Format cytowania w artykule:
- Książka: `Evans, *DDD*, r. 14 — „...cytat..."`
- Artykuł online: `Fowler, *StranglerFigApplication* (martinfowler.com/bliki/StranglerFigApplication.html)`
- RFC / spec: `RFC 7636 §4.1`
- Dokumentacja: `TanStack Query docs — *Important Defaults*`

Sekcja „Źródła" na końcu artykułu (przed „Relacje z innymi wzorcami") jest **wymagana zawsze gdy poza źródłem z backlogu użyłeś czegokolwiek**. Format: lista markdownowa z linkami.

**Nie kompiluj artykułu z mglistych wspomnień.** Jeśli po wyszukiwaniu wciąż nie masz pewności co do faktu — pomiń go zamiast zmyślać. Lepszy krótszy artykuł niż halucynacja w druku.

#### 4c. Aktualizacja README

Po napisaniu pliku **przenieś pozycję z backlogu do głównej listy**:
- Usuń wiersz numeru N z sekcji „Backlog" (G–W)
- Dodaj odsyłacz w odpowiedniej sekcji głównej (A–F) lub utwórz nową sekcję, jeśli żadna nie pasuje
- Format jak w istniejących wpisach: `N. [Nazwa](NN-slug.md) — jednolinijkowy hook`
- Zachowaj kolejność numeryczną — jeśli N=37 wskakuje w środek listy, nie renumeruj reszty, po prostu wstaw na właściwą pozycję

### 5. Test akceptacji

Wszystkie 10 punktów z testu akceptacji w `rewriting-pattern-articles`, **plus**:

11. Plik nazwany `NN-slug.md` zgodnie z numerem z README
12. Wpis z backlogu został przeniesiony do głównej listy w README (lub artykuł jasno argumentuje, czemu wzorzec NIE pasuje do projektu i pozostawia go w backlogu z notatką)
13. Sekcja praktyczna pasuje do wybranej formy z kroku 2: forma A/B = realne `file.ts:NN`, forma C = przykład poglądowy wyraźnie oznaczony + jedno-akapitowa notka „Czemu nie ma tego w tym repo"
14. Cytat źródła z backlogu obecny w tekście
15. Każdy fakt spoza źródła z backlogu (definicja, data, autor, cytat z dokumentacji) ma własne źródło w sekcji „Źródła" — albo nie ma go w artykule wcale

## Czego NIE robić

- **Nie wymyślać plików z tego repo.** Każdy `file.ts:NN` musi istnieć i być zweryfikowany `rg`-iem. Jeśli wzorca tu nie ma — pokaż realistyczny przykład spoza repo (forma C w kroku 2), wyraźnie oznaczony jako poglądowy. Nie pisz „w `apps/api/src/foo.ts` mamy…" jeśli tego pliku nie ma.
- **Nie kopiować analogii** z innego artykułu. Lista „Dobre kierunki" w `rewriting-pattern-articles` jest punktem wyjścia, ale analogia ma być świeża i mapowana 1:1 do *tego* wzorca.
- **Nie pisać artykułu o czymś, co już jest w 1–36 pod inną nazwą.** Najpierw sprawdź, czy backlogowy wzorzec nie pokrywa się z istniejącym (np. „Saga orchestration" vs istniejący #21 Cron+Leader Lease — to różne rzeczy, ale sprawdź).
- **Nie aktualizować README na ostatnią chwilę.** Zrób to w tej samej operacji co napisanie artykułu, nie zostawiaj „dorobię później".
- **Nie pisać z pamięci, jeśli pamięć jest mglista.** Brak pewności = `WebFetch` / `context7` / `WebSearch` przed pisaniem (patrz 4b). Halucynacja autora, daty, cytatu albo „klasycznej formy" wzorca to gorszy błąd niż pominięcie tej informacji.
- Nie pisz „w tym artykule omówimy…" / „podsumowując…". Artykuł kończy się sekcją „Relacje z innymi wzorcami".

## Format dispatchu agenta

Jeśli odpalasz to przez Agent tool, brief MUSI zawierać:

1. **Konkretny numer #N i slug** wybrany z backlogu (albo polecenie „weź pierwszy nieopisany")
2. **Wynik audytu kroku 2** — czy wzorzec występuje w repo i w jakiej formie (pełna / częściowa / brak), z listą plików-kandydatów (`rg -l`)
3. **Wskazanie:** „Najpierw przeczytaj `docs/patterns/01-hexagonal-ports-adapters.md`, `02-aggregate-root.md`, `03-layered-architecture.md` jako wzorzec docelowy, plus skill `rewriting-pattern-articles` po pełną listę reguł"
4. **Wstępne wyniki Test #1 i Test #2** (sekcje warunkowe)
5. **Sugerowana analogia** i lista terminów do słowniczka
6. **Format wyniku:** utworzyć plik `NN-slug.md`, zaktualizować `README.md`, zwrócić listę sekcji + analogię + co z literatury / repo zostało użyte

## Iteracyjny tryb po review

Gdy użytkownik daje feedback na świeżo napisany artykuł, **nie przepisuj całego pliku**. Zastosuj się do reguł z sekcji „Iteracyjny tryb po review" w `rewriting-pattern-articles`.
