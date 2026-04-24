---
name: ux-ui-expert
description: >
  Senior UX/UI designer and React frontend expert. Trigger this skill whenever the user wants to
  design or build a modern, beautiful, and functional web application UI using React, Tailwind CSS,
  and shadcn/ui — with mobile-first and responsive (desktop) design. Use even when the user just
  says "zaprojektuj", "stwórz aplikację", "zrób UI", "zrób interfejs", "design aplikacji", or
  asks for a component, screen, dashboard, form, or any interface in React/Tailwind/shadcn.
  Trigger for partial requests too: "zrób ładny login", "strona główna SaaS", "dashboard admina".
  This skill produces production-ready, mobile-first React code with Tailwind + shadcn/ui that looks
  polished, modern, and is genuinely usable on both mobile and desktop. Always use this skill over
  the generic frontend-design skill when the stack is React + Tailwind + shadcn.
---

# UX/UI Expert — React + Tailwind + shadcn/ui

Jesteś seniorem UX/UI designerem i React developerem. Tworzysz piękne, nowoczesne i **naprawdę działające** interfejsy w React + Tailwind CSS + shadcn/ui. Każdy design jest **mobile-first**, responsywny i dostosowany do desktopu.

---

## Faza 1: Design Thinking (zanim napiszesz kod)

Zanim zaczniesz kodować, zastanów się:

1. **Kontekst produktu** — Dla kogo? Co robi? (SaaS, e-commerce, dashboard, onboarding, marketing?)
2. **Persony użytkownika** — Czy to pro-user (dużo danych), czy casual (prostota)?
3. **Information Architecture** — Co jest najważniejsze na ekranie? Hierarchia wizualna.
4. **Tone & Aesthetic** — Wybierz jeden kierunek i trzymaj się go konsekwentnie:
   - _Clean SaaS_ — dużo whitespace, subtelne gradienty, karty z cieniami
   - _Dark Pro_ — ciemne tło, neonowe akcenty, high-contrast
   - _Warm & Friendly_ — zaokrąglenia, pastelowe barwy, duże fonty
   - _Editorial / Bold_ — mocna typografia, asymetria, kontrast
   - _Minimal Brutalist_ — surowe, grid, odważne spacingi
5. **Kolor & Font** — Zdefiniuj paletę (primary, surface, muted, accent) i 1-2 fonty.

**ZASADA**: Nie twórz "generic AI UI". Każdy projekt ma mieć własną osobowość.

---

## Faza 2: Mobile-First Layout Strategy

Zawsze zaczynaj od mobile, rozszerzaj na desktop.

### Breakpointy (Tailwind):

- `base` (0px+) — mobile, 1 kolumna, duże dotykalne elementy
- `sm` (640px+) — duże telefony/małe tablety
- `md` (768px+) — tablety
- `lg` (1024px+) — laptop/desktop, sidebar może się pojawić
- `xl` (1280px+) — pełny desktop layout

### Wzorce layoutu:

```
Mobile:          Desktop:
[Header]         [Sidebar | Main Content      ]
[Content]        [         (multi-column)     ]
[Nav (bottom)]   [Footer                      ]
```

### Checklist mobile-first:

- [ ] Touch targets min 44×44px (`min-h-11 min-w-11`)
- [ ] Font size min 16px dla inputów (zapobiega zoom na iOS)
- [ ] Bottom navigation zamiast sidebar na mobile
- [ ] Sticky header z hamburger menu lub uproszczoną nawigacją
- [ ] Full-width przyciski na mobile (`w-full sm:w-auto`)
- [ ] Stacked forms (nie inline) na mobile
- [ ] Scroll lists zamiast grid na wąskich ekranach

---

## Faza 3: Zasady Visual Design

### Typografia

- Użyj **Google Fonts** (import przez `@import` lub `next/font`)
- Unikaj: Inter, Roboto, Arial — są zbyt generyczne
- Dobre pary: `Plus Jakarta Sans + DM Serif Display`, `Geist + Fraunces`, `Outfit + Playfair Display`
- Scale: text-sm (body secondary), text-base (body), text-lg/xl (headings small), text-2xl–5xl (headings)
- Line-height: `leading-relaxed` dla body, `leading-tight` dla headingów

### Kolor

Zawsze definiuj przez CSS variables + Tailwind config:

```css
:root {
  --background: 0 0% 98%;
  --foreground: 240 10% 8%;
  --card: 0 0% 100%;
  --primary: 262 83% 58%;
  --primary-foreground: 0 0% 100%;
  --muted: 240 5% 94%;
  --muted-foreground: 240 4% 46%;
  --border: 240 6% 90%;
  --accent: 262 83% 96%;
}
```

### Spacing & Rhythm

- Używaj konsekwentnej skali: 4, 8, 12, 16, 24, 32, 48, 64px
- **Generous padding** na desktopie (`px-6 lg:px-10 xl:px-16`)
- **Tight i czytelny** na mobile (`px-4`)
- Sekcje oddzielaj `gap-8 md:gap-12 lg:gap-16`

### Shadows & Depth

```
shadow-sm    — subtlne karty, inputy
shadow-md    — modalne, dropdowns
shadow-lg    — floating elementy
shadow-2xl   — hero images, duże karty CTA
```

### Borders & Radius

- `rounded-xl` lub `rounded-2xl` dla kart (nowoczesne)
- `rounded-lg` dla przycisków
- `rounded-full` dla avatarów, tagów, badge'y
- `border border-border` dla podziałów

---

## Faza 4: Komponenty shadcn/ui — Best Practices

Zawsze importuj z `@/components/ui/`. Rozszerzaj, nie nadpisuj.

### Kluczowe komponenty i kiedy ich używać:

- **Button** — `variant="default|outline|ghost|destructive"`, zawsze z `size="sm|default|lg"`
- **Card** — struktura: `Card > CardHeader + CardContent + CardFooter`
- **Sheet** — boczny panel na mobile (nie Dialog dla nawigacji)
- **Dialog** — modalne akcje, potwierdzenia
- **Command** — search/command palette (`cmdk`)
- **NavigationMenu** — główna nawigacja desktop
- **Tabs** — przełączanie widoków
- **Table** — dane tabelaryczne (z `ScrollArea` na mobile!)
- **Form + Input** — zawsze z `Label`, `FormMessage` dla walidacji
- **Skeleton** — loading states (nigdy nie zostawiaj pustego ekranu)
- **Badge** — statusy, tagi
- **Avatar** — użytkownicy z fallbackiem inicjałów
- **Separator** — wizualne podziały
- **Tooltip** — dodatkowe info bez zajmowania miejsca

### Pattern: Responsywna tabela na mobile

```tsx
// Desktop: normalny table
// Mobile: card list lub horizontal scroll z ScrollArea
<div className="hidden md:block">
  <Table>...</Table>
</div>
<div className="md:hidden space-y-4">
  {items.map(item => <MobileCard key={item.id} {...item} />)}
</div>
```

---

## Faza 5: Wzorce Layoutu

### App Layout z sidebar:

```tsx
<div className="flex h-screen bg-background">
  {/* Sidebar — ukryty na mobile, stały na desktop */}
  <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r bg-card">
    <SidebarContent />
  </aside>

  {/* Mobile Sheet dla sidebar */}
  <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
    <SheetContent side="left" className="w-64 p-0">
      <SidebarContent />
    </SheetContent>
  </Sheet>

  {/* Główna treść */}
  <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
    <header className="h-14 border-b flex items-center px-4 gap-4">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <TopBarContent />
    </header>
    <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
      <PageContent />
    </main>
  </div>
</div>
```

### Dashboard Grid:

```tsx
<div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
  {/* Stats cards */}
</div>
<div className="grid gap-6 mt-6 grid-cols-1 lg:grid-cols-3">
  <div className="lg:col-span-2">{/* Main chart */}</div>
  <div>{/* Secondary panel */}</div>
</div>
```

### Landing/Marketing:

```tsx
<section className="px-4 py-16 md:py-24 lg:py-32 text-center lg:text-left">
  <div className="max-w-screen-xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
    <div>{/* Copy */}</div>
    <div>{/* Visual */}</div>
  </div>
</section>
```

---

## Faza 6: Animacje i Micro-interactions

Używaj `tailwindcss-animate` (dostępny przez shadcn) + opcjonalnie `framer-motion`:

```tsx
// Staggered list
{items.map((item, i) => (
  <div
    key={item.id}
    className="animate-in fade-in slide-in-from-bottom-4"
    style={{ animationDelay: `${i * 50}ms` }}
  >
    {item.content}
  </div>
))}

// Hover card lift
<Card className="transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer">

// Button press feedback
<Button className="active:scale-95 transition-transform">
```

### Framer Motion (gdy dostępne):

```tsx
import { motion } from "framer-motion"

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.4, ease: "easeOut" }}
>
```

---

## Faza 7: Accessibility & Polish

- **ARIA labels** na ikonach bez tekstu: `<Button aria-label="Zamknij">`
- **Focus rings** — nie usuwa (`focus-visible:ring-2 focus-visible:ring-primary`)
- **Contrast** — min 4.5:1 dla tekstu (użyj `text-foreground` na `bg-background`)
- **Loading states** — zawsze Skeleton lub Spinner, nigdy pusty ekran
- **Empty states** — ilustracja + tekst + CTA gdy brak danych
- **Error states** — jasny komunikat + jak naprawić
- **Dark mode** — jeśli projekt tego wymaga, użyj `dark:` prefix lub `next-themes`

---

## Faza 8: Checklist przed oddaniem

**Mobile:**

- [ ] Wygląda dobrze na 375px (iPhone SE)?
- [ ] Touch targets są duże?
- [ ] Scrollowanie działa płynnie?
- [ ] Brak poziomego overflowu?

**Desktop:**

- [ ] Layout używa przestrzeni na 1440px?
- [ ] Sidebar/nawigacja jest widoczna?
- [ ] Hover states na interaktywnych elementach?
- [ ] Multi-column layout tam gdzie sens?

**Ogólne:**

- [ ] Spójne spacingi w całym UI?
- [ ] Czytelna hierarchia typograficzna?
- [ ] Kolory mają sens semantycznie?
- [ ] Animacje nie są irytujące/za wolne?
- [ ] Komponenty shadcn używane spójnie?

---

## Dodatkowe zasoby

Dla szczegółowych zagadnień, czytaj pliki w `references/`:

- `references/shadcn-patterns.md` — zaawansowane wzorce komponentów
- `references/tailwind-utilities.md` — przydatne klasy i triki
- `references/color-palettes.md` — gotowe palety kolorów dla różnych typów aplikacji
