---
name: Apex
description: Prywatny tracker kolekcji gier wideo – precyzyjny, szybki, skupiony.
colors:
  accent: "#4F6EF7"
  ink: "#1c1c1e"
  ink-2: "#3a3a3a"
  ink-3: "#4a4a4a"
  ink-5: "#666666"
  ink-6: "#888888"
  muted: "#9a9a9a"
  faint: "#b0b0b0"
  hint: "#b8b8b8"
  line-2: "#e4e4e4"
  line-3: "#e8e8e8"
  line-4: "#ebebeb"
  line-5: "#f0f0f0"
  surface-head: "#f2f2f2"
  surface-hover: "#f5f5f5"
  surface-hover2: "#f6f6f6"
  surface-chip: "#f8f8f8"
  surface-page: "#fafafa"
  row: "#f0f3ff"
  row-hover: "#fafbff"
  status-progress: "#4F6EF7"
  status-pending: "#f59e0b"
  status-done: "#10b981"
  status-inactive: "#ef4444"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.07em"
  caption:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "#4562e0"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-subtle:
    backgroundColor: "{colors.surface-head}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  input-search:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink-2}"
    rounded: "7px"
    padding: "6px 10px"
    height: "32px"
---

# Design System: Apex

## 1. Overview

**Creative North Star: "The Operator's Console"**

Apex jest narzędziem dla jednej osoby przy biurku. Interfejs nie chce być zauważony: pracuje po cichu, wszystko na swoim miejscu, zero ozdób. Okładki gier są jedynym kolorem który system chętnie pokazuje; reszta to precyzyjny system szarości przeciętych jednym stonowanym indygo. Przy każdej decyzji projektowej właściwe pytanie brzmi: czy ten element przyspiesza pracę z kolekcją? Jeśli nie, nie istnieje.

System odrzuca estetykę platformy gamingowej: ciemne tła z neonowymi akcentami (Steam), społecznościowe karty z gwiazdkami i avatarami (Backloggd), przytłoczone nagłówki portali (HowLongToBeat, IGDB), transakcyjne UI sklepów (GG.deals). Odrzuca gamifikację: odznaki, paski postępu "ukończenia", osiągnięcia. To jest prywatny inwentarz, nie platforma.

Gęstość jest cnotą. Dużo informacji na ekranie nie jest problemem do rozwiązania — pod warunkiem że jest rytm i hierarchia. Spacing nie jest płaski: sekcje, wiersze tabeli i nagłówki mają różne oddechy. Precyzja na poziomie Raycast: `py-[9px]` w wierszach, nie `py-4`.

**Key Characteristics:**
- Jasne tło (`#fafafa`), jeden indygo akcent, reszta akromatycznych szarości z chłodnym undertone
- Inter na każdym poziomie; hierarchia wyłącznie przez rozmiar, grubość i uppercase
- Tabele jako główny widok (dwa warianty: default + cards); nie karty
- Warstwa robocza płaska; cień wyłącznie dla elementów flotujących (dropdown, dialog)
- StatusBadge: SVG-glify, nie kolorowe pille; cztery statusy, jeden hue z akcentem

## 2. Colors: Spokojny Ultramaryn

Strategia restrained: akromatyczna skala szarości z zimnym undertone, jeden akcent nieprzekraczający 10% powierzchni ekranu. Zaznaczony wiersz dostaje subtelny liliowy tint, a nie kolejny niebieski.

### Primary

- **Spokojny Ultramaryn** (`#4F6EF7`): jedyny nasycony kolor w systemie. Używany wyłącznie na: primary button, aktywny element nawigacji, status "in progress". Nigdy jako tło powierzchni roboczej, nigdy dekoracyjnie.

### Neutral

**Skala pisma** (od najciemniejszego do najjaśniejszego):
- **Konsolowy Czarny** (`#1c1c1e`): kolor treści pierwszorzędowej. Nie czysta czerń; lekki chłodny undertone.
- **Grafit Głęboki** (`#3a3a3a`): mocne etykiety, treść aktywnych inputów.
- **Grafit Roboczy** (`#4a4a4a`): elementy nav w stanie default, drugorzędne nagłówki.
- **Grafit Wygaszony** (`#666666`): deaktywowane etykiety, podpisy.
- **Grafit Cichy** (`#888888`): focus border input, pomocnicze wartości.
- **Cisza** (`#9a9a9a`): muted; drobne metadane, wartości kolumn tabeli.
- **Blady** (`#b0b0b0`): faint; nagłówki kolumn w wariancie cards, nieaktywne ikony.
- **Podpowiedź** (`#b8b8b8`): hint; ikony pomocnicze (lupa w search), placeholder tekst.

**Skala linii** (separatory i obramowania):
- **Linia Subtelna** (`#e4e4e4`): border pola search input.
- **Linia Kart** (`#e8e8e8`): border wierszy w cards variant tabeli, separatory formularzy.
- **Linia Elementów** (`#ebebeb`): border elementów UI (user card, separator sidebar).
- **Linia Wierszy** (`#f0f0f0`): separator między wierszami tabeli default.

**Skala powierzchni** (od ciemniejszej do jaśniejszej):
- **Tło Nagłówka** (`#f2f2f2`): thead tabeli default, tło wyłączonych elementów.
- **Hover Roboczy** (`#f5f5f5`): hover tło elementów listy i nav.
- **Hover Kart** (`#f6f6f6`): hover tło wierszy w cards variant.
- **Chip** (`#f8f8f8`): tło micro-elementów, nieaktywne tagi.
- **Tło Strony** (`#fafafa`): main content area. Nie czyste białe; odcina treść od krawędzi.

**Tinted row states:**
- **Zaznaczony Wiersz** (`#f0f3ff`): liliowy tint na zaznaczonym wierszu. Wyraźny, nie krzykliwy.
- **Hover Zaznaczonego** (`#fafbff`): hover tło dla niezaznaczonego wiersza; niemal białe z śladem indygo.

### Tertiary: Status

Cztery wartości statusu, wyłącznie wewnątrz komponentu StatusBadge.

- **W trakcie** (`#4F6EF7`): dzieli hue z akcentem — spójny język "aktywny/działający" w całym systemie.
- **Oczekuje** (`#f59e0b`): amber, ostrożność.
- **Ukończone** (`#10b981`): emerald, sukces.
- **Nieaktywne** (`#ef4444`): czerwień, zakończone/wycofane.

**Reguła Jednego Głosu.** `#4F6EF7` ma jedną rolę na raz: primary button, aktywny nav, lub status-progress. Nigdy dwie naraz, nigdy jako tło powierzchni.

**Reguła Statusów.** Cztery kolory statusu istnieją wyłącznie wewnątrz StatusBadge. Zakazane jako tło, obramowanie, kolor tekstu, czy dekoracja poza tym komponentem.

## 3. Typography

**Font:** Inter (ui-sans-serif, system-ui, sans-serif) — jeden krój przez cały system.

**Charakter:** Humanistyczna groteskowa, neutralna ale nie zimna. Hierarchia budowana wyłącznie przez kontrast rozmiaru i grubości oraz uppercase z trackingiem dla etykiet. Zero dekoracji typograficznych; zero serif, zero mono.

### Hierarchy

- **Display** (700, 15px, lh 1.2): tytuł strony w AppHeader (np. "Games", "Wishlist"). Ikona + tekst jako para.
- **Title** (600, 14px, lh 1.3): nagłówek sidebar, tytuł dialogu, nagłówki sekcji formularza.
- **Body** (400–500, 13px, lh 1.5): treść komórek tabeli, wartości formularzy, tekst dialogów. Max 65ch w kontekście czytania.
- **Label** (600, 11px, lh 1.2, tracking 0.07em, UPPERCASE): nagłówki kolumn tabeli, etykiety sekcji w sidebar. Tylko w tych dwóch kontekstach.
- **Caption** (400, 10.5px, lh 1.3): email użytkownika w UserCard, metadane pomocnicze, podpisy platform.

**Reguła Uppercase.** Uppercase z trackingiem jest zarezerwowany dla Label: nagłówki kolumn tabel i sekcje sidebar. Poza tym kontekstem: sentence case wszędzie. Przyciski, tytuły stron, treść, dialogi — sentence case.

## 4. Elevation

System jest płaski w stanie roboczym. Tabele, listy i formularze nie mają cienia w żadnym stanie spoczynku; głębokość wyraża się zmianą koloru tła (tonal layering). Cień pojawia się wyłącznie gdy element flotuje ponad powierzchnią płótna.

### Shadow Vocabulary

- **Flotacja Niska** (`0 1px 4px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)`): dropdown menu, tooltip, mały popover. Kompozyt: rozproszone tło + cienka obwódka.
- **Flotacja Wysoka** (`0 2px 8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.08)`): dialog modal, command palette. Wyraźniejsze uniesienie z ciemniejszą obwódką.

**Reguła Płaskiej Powierzchni.** Żaden element w warstwie roboczej (wiersz tabeli, karta listy, pole formularza) nie ma cienia w stanie spoczynku ani hover. Shadow = flotacja; flotacja = element nad płótnem, nie element na płótnie.

## 5. Components

### Buttons

Precyzyjne i zwarte. Mało paddingu, treść decyduje o szerokości, nie kontener.

- **Kształt:** miękko zaokrąglony (6px, `rounded-md`). Nigdy pill, nigdy ostry.
- **Primary** (`h-8 px-3`, 13px medium): `#4F6EF7` tło, biały tekst. Hover: `#4562e0`. Active: `#3b55cc`. Disabled: opacity 50%.
- **Ghost** (`h-8 px-3`): przezroczyste tło, `#4a4a4a` tekst. Hover: `#f5f5f5` tło, `#1c1c1e` tekst.
- **Subtle** (`h-8 px-3`): `#f2f2f2` tło, `#1c1c1e` tekst. Hover: `#ebebeb`.
- **Outline** (`h-8 px-3`): białe tło + `#ebebeb` border. Hover: `#f5f5f5`.
- **Focus ring:** 1px ring przy `--ring` (CSS var). Zawsze widoczny przy focus-visible.
- **Ikona w przycisku:** 13–15px SVG, gap 8px od tekstu.

### DataTable

Dwa warianty. Żaden nie wymaga poziomego scrollowania na desktopie.

**Default variant** (słowniki, platformy, dane pomocnicze):
- Thead: `#f2f2f2` tło, sticky top, label 11px uppercase `#9a9a9a`, zaokrąglone górne rogi 8px.
- Wiersze: `border-bottom #f0f0f0`, `px-3 py-[10px]`, hover `#fafbff`, zaznaczony `#f0f3ff`.

**Cards variant** (główna lista gier — widok domyślny):
- Thead: przezroczysty bg, `border-bottom #e8e8e8`, label `#b0b0b0`.
- Wiersze: białe "karty" z `border-y + border-l/r (#e8e8e8)`, zaokrąglone 10px, `border-spacing-y: 4px` między wierszami.
- Hover: `#f6f6f6`. Zaznaczony: `#f0f3ff`.

### Search Input

- Kontener: `border #e4e4e4`, bg white, `rounded-[7px]`, `px-[10px] py-[6px]`.
- Focus-within: border przechodzi na `#888888`.
- Ikona lupy: `#b8b8b8`, 13px. Tekst: 12.5px, `#3a3a3a`. Placeholder: `#b8b8b8`.
- Clear button (X): pojawia się gdy jest wartość; `#b8b8b8` kolor, hover `#3a3a3a`.

### Status Badge

Glyph SVG + tekst inline. Trzy prawa: (1) glyph zawsze SVG, nie emoji ani icon font; (2) tekst zawsze 11px `#1c1c1e`; (3) gap 6px między glyphem a tekstem.

- **Progress:** pełny krąg `#4F6EF7`
- **Pending:** trójkąt ostrzegawczy `#f59e0b`
- **Done:** krąg z checkmark, wypełnienie `#10b981`, biały stroke
- **Inactive:** pełny krąg `#ef4444`

### Navigation Sidebar

- Tło: białe, `border-right #f0f0f0`. Collapsible offcanvas na mobile.
- Header: logo mark 8×8 na `#1c1c1e` tle (7px radius), nazwa produktu 14px 600.
- Sekcja label: uppercase 10px `#b8b8b8`, tracking 0.08em, `pt-4 pb-[6px] px-4`.
- Nav item (default): `px-4 py-[10px]`, 13.5px `#4a4a4a`, ikona opacity 55%, radius 7px.
- Nav item (active): tło `oklch(95% 0.02 220)` (bardzo subtelny zimny tint), tekst `#4F6EF7`, ikona `#4F6EF7` opacity 100%.
- Hover (default): `#f5f5f5` tło, `#1c1c1e` tekst.
- Add shortcut: `#4F6EF7` tło, white icon, radius 4px, pojawia się jako absolute overlay na prawo od etykiety nav.

## 6. Do's and Don'ts

### Do:
- **Do** używaj `#4F6EF7` wyłącznie w jednej roli naraz: primary button, aktywny nav, lub status-progress. Rzadkość jest celowa.
- **Do** buduj hierarchię przez rozmiar i grubość Inter. Kolor nie jest narzędziem hierarchii treści.
- **Do** stosuj uppercase z trackingiem wyłącznie na nagłówkach kolumn tabel i etykietach sekcji nav. Wszędzie indziej: sentence case.
- **Do** wyrażaj stan zaznaczenia i hover zmianą tła (`#f0f3ff`, `#f5f5f5`, `#f6f6f6`), nie cieniem ani obramowaniem.
- **Do** zachowuj gęstość Raycast-style: `py-[9px]` do `py-[10px]` w wierszach tabeli. Luźniejszy padding wymaga uzasadnienia.
- **Do** traktuj okładki gier jako jedyny element który może wnosić kolor spoza palety systemowej. Są gwiazdą.
- **Do** używaj tonal layering (zmiana bg) dla głębokości w warstwie roboczej. Shadow tylko dla flotujących elementów.

### Don't:
- **Don't** używaj ciemnych teł z neonowymi akcentami. Apex nie jest konsolą do gier ani Steamem.
- **Don't** replikuj estetyki portali gamingowych: żadnych kolorowych bannerów sekcji (HowLongToBeat), żadnych dużych hero-image nagłówków, żadnych consumer-style ratingów (IGDB).
- **Don't** gamifikuj: żadnych pasków postępu ukończenia kolekcji, odznak, "osiągnięć", ani widoku "co grają inni".
- **Don't** używaj kolorów statusu (`#f59e0b`, `#10b981`, `#ef4444`) poza komponentem StatusBadge. Zarezerwowane.
- **Don't** dodawaj `border-left` jako kolorowy stripe na kartach, wierszach, alertach ani calloutach. Pełne obramowanie lub tło tintowane albo nic.
- **Don't** używaj `background-clip: text` z gradientem. Żaden tekst w Apex nie ma gradientu.
- **Don't** dodawaj shadow do elementów w warstwie roboczej (wiersze tabeli, listy, pola formularza w stanie spoczynku).
- **Don't** twórz identycznych kart-grid z ikonką + nagłówek + tekst. To jest język Backloggd; Apex używa tabel.
- **Don't** otwieraj modala jako pierwszego rozwiązania. Wyczerpaj inline/progressive alternatywy. Jeśli modal jest konieczny: shadow flotacja wysoka, brak glassmorphism.
