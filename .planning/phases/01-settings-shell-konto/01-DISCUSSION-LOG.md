# Phase 1: Settings Shell + Konto - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 1-settings-shell-konto
**Areas discussed:** Routing & layout shell, Side-nav scope & shape, Password change UX, Revoke-all-sessions interaction

---

## Routing & Layout Shell

### Q1 — Jak strukturalnie podzielić `/settings`?

| Option | Description | Selected |
|--------|-------------|----------|
| Nested route + SettingsLayout | `SettingsLayout.tsx` jako route layout z side-nav + `<Outlet />`; sub-trasy `/settings/account` itd.; `/settings` redirectuje na `/settings/account` | ✓ |
| Flat page z internal state | Jedna strona `/settings`, sekcje przełączane stanem; URL nie odzwierciedla sekcji | |
| Tabs w header | Horizontal tabs zamiast lewego side-nav; niezgodne z decyzją z PROJECT.md | |

**User's choice:** Nested route + SettingsLayout
**Notes:** Zgodne z istniejącą decyzją w PROJECT.md ("side-nav + content") i z konwencją react-router v6 nested routes (`<Outlet />`).

### Q2 — Gdzie umieścić nowe pliki dla settings shell?

| Option | Description | Selected |
|--------|-------------|----------|
| `pages/settings/` | Katalog `apps/client/src/pages/settings/` z layoutem + sub-pages jako tightly coupled siblings | ✓ |
| Flat in pages/, layout in components/layout/ | `settings-layout.tsx` w `components/layout/`, strony flat | |

**User's choice:** pages/settings/
**Notes:** Pattern "tightly coupled siblings" istnieje w codebase (np. `games-columns.tsx` koło `games.tsx`).

---

## Side-nav Scope & Shape

### Q3 — Co pokazujemy w settings side-navie w Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Tylko 'Konto' | Tylko aktywne sekcje, brak placeholderów | |
| Konto + disabled placeholders | Pokazujemy Integracje/Dane/Wygląd jako disabled z tooltipem "Wkrótce" | ✓ |

**User's choice:** Konto + disabled placeholders
**Notes:** Pokazuje shape przyszłego produktu już w Phase 1. Disabled items wymagają nieklikowalnego stanu (`aria-disabled`, brak NavLink, cursor-not-allowed) — szczegóły w CONTEXT.md D-06.

### Q4 — Wizualnie — jak buduje się settings side-nav?

| Option | Description | Selected |
|--------|-------------|----------|
| Lekki własny komponent | Vertical list NavLinków + section labels, własne style (apex-* tokens), bez ShadcnSidebar | ✓ |
| Reuse ShadcnSidebar primitive | Drugi `<ShadcnSidebar>` zagnieżdżony w SettingsLayout | |

**User's choice:** Lekki własny komponent
**Notes:** Unika zagnieżdżonego `SidebarProvider` i mobile-state collisions z aplikacyjnym sidebarem.

---

## Password Change UX

### Q5 — Jak wyrenderować formularz zmiany hasła w sekcji Konto?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline section/card | Karta z 3 polami + button na stronie Konto, bez modala | ✓ |
| Modal/Dialog | Trigger button otwiera Dialog z formularzem | |

**User's choice:** Inline section/card
**Notes:** Mniej click-overhead, all-visible-at-once dla power-usera; nie wymaga nowej `dialog` shadcn primitive.

### Q6 — Czy razem ze zmianą hasła oferujemy revoke-other-sessions?

| Option | Description | Selected |
|--------|-------------|----------|
| Checkbox 'Wyloguj inne sesje' (default on) | `revokeOtherSessions: true` jako bezpieczniejszy default | ✓ |
| Bez checkboxa | Prosta zmiana hasła, revoke jest osobnym przyciskiem | |

**User's choice:** Checkbox 'Wyloguj inne sesje' default on
**Notes:** Standardowy security-default po zmianie hasła (zmieniasz bo ktoś mógł zobaczyć — chcesz wykopać inne sesje).

### Q7 — Walidacja formularza zmiany hasła — jaką logikę client-side dodajemy?

| Option | Description | Selected |
|--------|-------------|----------|
| Min length + match | Client check: 8+ znaków, newPassword === confirmPassword | |
| Tylko surface server errors | Tylko HTML5 `required`, reszta po stronie better-auth | ✓ |
| Pełna walidacja + strength meter | Length + match + zxcvbn-style strength | |

**User's choice:** Tylko surface server errors
**Notes:** Mniej kodu po stronie klienta. WAŻNY WYJĄTEK zapisany w CONTEXT.md (D-10 + Discretion): `newPassword === confirmPassword` musi być client-side, bo better-auth nie zna pojęcia "potwierdź"; wszystko inne (length, current password correctness, rate-limit) — serwer.

---

## Revoke-All-Sessions Interaction

### Q8 — Czy 'Wyloguj wszystkie sesje' wymaga potwierdzenia w AlertDialog?

| Option | Description | Selected |
|--------|-------------|----------|
| AlertDialog z potwierdzeniem | "Czy na pewno wylogować wszystkie sesje?" + [Anuluj]/[Wyloguj wszystkie] | ✓ |
| Jeden klik bez confirmacji | Od razu `revokeSessions()` + redirect | |

**User's choice:** AlertDialog z potwierdzeniem
**Notes:** Wymaga `bunx shadcn@latest add alert-dialog` w `apps/client/`. Destructive action zasługuje na safety-net (D-15 w CONTEXT.md).

### Q9 — Gdzie umieścić przycisk 'Wyloguj wszystkie sesje' na stronie Konto?

| Option | Description | Selected |
|--------|-------------|----------|
| Osobna karta 'Bezpieczeństwo' | Strona ma 3 karty: Profil / Zmień hasło / Bezpieczeństwo | ✓ |
| Pod formularzem hasła | Wszystko w jednej karcie, separator między PW i revoke | |

**User's choice:** Osobna karta 'Bezpieczeństwo'
**Notes:** Czyste granice odpowiedzialności; przyszłe Bezpieczeństwo items (2FA, listSessions) naturalnie tam dorosną w przyszłych milestone'ach.

---

## Claude's Discretion

User pozostawił do mojej decyzji:
- Dokładne klasy Tailwind dla nowych komponentów (póki używają tokenów `apex-*`).
- Czy `AccountProfile` to osobny plik czy inline w `account.tsx` (heurystyka: <30 linii → inline).
- Tekst tooltipa "Wkrótce" przy disabled nav items.
- Konkretne ikony Lucide dla nav items (sugestia w CONTEXT.md: User/Plug/Database/Palette).
- Wybór wzorca dla `newPassword === confirmPassword` validation (zaproponowane inline w handlerze submit przed wywołaniem `changePassword`).

## Deferred Ideas

Wszystkie poniżej trafiły do `<deferred>` sekcji CONTEXT.md:
- `useCredentialsForm` hook → Phase 4 (FE-02)
- Sekcja Integracje → Phase 2 (INT-01..INT-08)
- Sekcja Dane → v2 (SET-V2-01)
- Sekcja Wygląd → v2 (SET-V2-02)
- Edit name/avatar — poza scope milestone'u
- 2FA / passkeys — poza scope milestone'u
- Lista aktywnych sesji (device-info, last-seen) — wymaga osobnego UI
- Password strength meter — over-engineered dla single-user
