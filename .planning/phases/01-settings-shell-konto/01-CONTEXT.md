# Phase 1: Settings Shell + Konto - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Pierwsza wertykalna kromka strony `/settings`: rozszerzalna powłoka (settings layout + side-nav + content area) z działającą sekcją "Konto" (email zalogowanej sesji, formularz zmiany hasła, wyloguj wszystkie sesje). Powłoka jest zaprojektowana pod kolejne sekcje (Integracje w Phase 2, Dane / Wygląd w przyszłych milestone'ach), ale w tej fazie tylko "Konto" jest live. Wszystko żyje pod istniejącym `ProtectedRoute → AppLayout` i wizualnie spójne z resztą aplikacji (shadcn, paleta neutralna, polski copy, Linear/Raycast feel).

**Pokrywa requirements:** SET-01, SET-02, SET-03, SET-04, SET-05, FE-07.

</domain>

<decisions>
## Implementation Decisions

### Routing & Layout Shell
- **D-01:** Nested route z dedykowanym `SettingsLayout` — `/settings` montuje się jako route layout pod `ProtectedRoute → AppLayout`, ma w sobie side-nav po lewej + `<Outlet />` po prawej. Sub-trasy: `/settings/account` (jedyna aktywna w Phase 1), Phase 2 dopina `/settings/integrations`.
- **D-02:** `/settings` (bez sub-ścieżki) renderuje `<Navigate to="account" replace />` jako `index` route — deep-link/refresh na `/settings` ląduje na `/settings/account`. Aktualny `Placeholder` w `main.tsx` znika.
- **D-03:** Pliki w nowym katalogu `apps/client/src/pages/settings/`. Konwencja kebab-case zachowana. Planowana zawartość:
  - `settings-layout.tsx` — SettingsLayout (Outlet, side-nav, container)
  - `settings-nav.tsx` — komponent side-nav (lista NavLinków + section labels)
  - `account.tsx` — `AccountPage` (orchestruje profile / password-form / sessions-card)
  - `account-password-form.tsx` — formularz zmiany hasła (composed by account.tsx)
  - `account-sessions-card.tsx` — karta "Bezpieczeństwo" z revoke-all-sessions (composed by account.tsx)
- **D-04:** Aktualny `bottomNav` w `app sidebar` (`apps/client/src/components/layout/sidebar.tsx`) nadal linkuje do `/settings` — bez zmian; po D-02 trafi automatycznie na `/settings/account`.

### Side-nav (settings-nav.tsx)
- **D-05:** Lekki własny komponent — vertical list NavLinków z react-router-dom, grupowany section labelami (`KONTO`, `POZOSTAŁE`). NIE używamy `ShadcnSidebar` primitive (uniknięcie zagnieżdżonego `SidebarProvider`, brak mobile-state collisions). Style: te same Tailwind tokens co reszta apki (`apex-ink`, `apex-line`, `apex-accent`, `apex-surface-hover`).
- **D-06:** W Phase 1 nav zawiera dwie grupy:
  - **KONTO**: `Konto` → `/settings/account` (active)
  - **POZOSTAŁE**: `Integracje`, `Dane`, `Wygląd` — wszystkie disabled/grey z tooltipem "Wkrótce". Komunikują shape przyszłego produktu (Phase 2+).
  - Disabled items NIE są klikalne (`aria-disabled`, brak `<a>`/NavLink — span z muted color + cursor-not-allowed).
- **D-07:** Active state na NavLink: ten sam wzorzec co istniejący `NavRow` w `sidebar.tsx` (bg `oklch(95% 0.02 220)`, font-semibold, kolor `apex-accent`). Klucz wizualnej spójności (FE-07).

### Password Change UX (account-password-form.tsx)
- **D-08:** Inline karta na stronie Konto (NIE modal). Tytuł "Zmień hasło" + 3 pola (Aktualne / Nowe / Potwierdź) + checkbox + button "Zapisz" na dole karty. Wszystko widoczne od razu, brak click-overhead.
- **D-09:** Checkbox "Wyloguj wszystkie inne sesje" pod polami hasła, **domyślnie zaznaczony** (`defaultChecked`). Mapuje na `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })` w better-auth. Bezpieczniejszy default po zmianie hasła.
- **D-10:** **Brak walidacji client-side** — opieramy się wyłącznie na server errors z better-auth. Inputy mają tylko `required` HTML5. Walidacja długości (`minPasswordLength: 8` z `auth.ts`), poprawności aktualnego hasła, rate-limitu — wszystko serwer.
- **D-11:** Forma używa wzorca **uncontrolled inputs + FormData** (zgodnie z MEMORY: `feedback_react_autofill_uncontrolled`) — NIE controlled `useState` per pole. Identyczny pattern jak `apps/client/src/pages/login.tsx:14-36`: `new FormData(form)`, `String(data.get('currentPassword') ?? '')` itd. Lokalny `useState` tylko dla `error` (string|null) i `isPending` (boolean).
- **D-12:** Po sukcesie:
  1. Toast `sonner` z polskim komunikatem ("Hasło zmienione")
  2. `form.reset()` — czyści pola
  3. Jeśli `revokeOtherSessions: true` było ustawione — better-auth zakończy inne sesje serwerowo; aktualna sesja zostaje. **Brak** `refetchSession` ani redirect — user zostaje na `/settings/account`.
- **D-13:** Server errors surface'owane inline pod formularzem (jak `apps/client/src/pages/login.tsx:43-47` — czerwony banner z `border-red-200 bg-red-50`). Mapowanie błędów better-auth na polskie komunikaty w jednym helperze (`mapAuthError(error.code)` lub inline switch).

### Revoke-All-Sessions UX (account-sessions-card.tsx)
- **D-14:** **AlertDialog z potwierdzeniem** wymagany przed `revokeSessions()`. Tekst:
  - Title: "Wylogować wszystkie sesje?"
  - Description: "Zostaniesz przekierowany na ekran logowania. Twoja kolekcja pozostanie nietknięta."
  - Akcje: `[Anuluj]` (cancel) + `[Wyloguj wszystkie]` (destructive variant — czerwony).
- **D-15:** Wymaga instalacji shadcn `alert-dialog` primitive — `bunx shadcn@latest add alert-dialog` w `apps/client/`. Trafi do `apps/client/src/components/ui/alert-dialog.tsx` (Biome go ignoruje przez `**/components/ui/**`). To samo dla `card` (jeśli nie ma) i `label`.
- **D-16:** Flow po potwierdzeniu w AlertDialog:
  1. `await authClient.revokeSessions()` — better-auth endpoint `/revoke-sessions`
  2. `await refetchSession()` — **OBOWIĄZKOWE** przed `navigate` (MEMORY: `feedback_better_auth_session_refetch`); inaczej `ProtectedRoute` bounce-uje na `/login` i jest mess
  3. `queryClient.removeQueries(...)` — czyścimy cache (zgodnie z `sidebar.tsx:117` `onLogout`)
  4. `navigate('/login', { replace: true })`
- **D-17:** Karta "Bezpieczeństwo" jest **osobną sekcją** na stronie Konto (NIE w karcie "Zmień hasło"). Strona ma 3 karty: Profil → Zmień hasło → Bezpieczeństwo. Czyste granice odpowiedzialności i wizualna hierarchia.

### Account Page Content
- **D-18:** Sekcja "Profil" pokazuje email z `useSession()` jako read-only tekst (`<dt>Email</dt><dd>{user.email}</dd>` pattern lub prosty label + value). Bez avatara, bez edit-mode w tej fazie. Jeśli `user.name` istnieje (better-auth wspiera), też pokazujemy.
- **D-19:** Layout strony Konto: pełnoekranowy panel (MEMORY: `feedback_layout_style`), kolumny max-width ~720px wycentrowane (typowe dla form-heavy settings). Padding/spacing zgodny z istniejącą stronicą (np. `apps/client/src/pages/games.tsx`).
- **D-20:** Strona Konto ma nagłówek `<h2>Konto</h2>` + opcjonalnie subtitle, potem stack 3 kart z marginesami między nimi.

### API Surface (auth-client.ts)
- **D-21:** Rozszerzamy `apps/client/src/lib/auth-client.ts` o eksport `changePassword`, `revokeSessions` z `authClient`:
  ```ts
  export const { signIn, signUp, signOut, useSession, changePassword, revokeSessions } = authClient;
  ```
- **D-22:** Server-side: `apps/api/src/infrastructure/auth/auth.ts` **nic nie zmienia** — better-auth ma `changePassword` i `revokeSessions` aktywne by-default w `emailAndPassword` config. Brak nowych endpointów do dodania w `apps/api/src/index.ts`.

### Claude's Discretion
- Dokładne klasy Tailwind dla nowych komponentów (póki zgodne z istniejącymi tokenami `apex-*` i wzorcem z `sidebar.tsx`/`app-layout.tsx`).
- Wewnętrzna kompozycja `AccountPage` — czy `AccountProfile` to osobny plik, czy inline w `account.tsx`. Heurystyka: jeśli karta Profil zostaje <30 linii, inline; inaczej wyciąg.
- Dokładny tekst tooltipa "Wkrótce" przy disabled nav items (np. "Wkrótce w kolejnym wydaniu" vs "Coming soon").
- Wybór ikon Lucide dla nav items ("Konto" → `User`, "Integracje" → `Plug`, "Dane" → `Database`, "Wygląd" → `Palette`) — open do estetycznego ditto z istniejącego `Icon` setu.
- Czy walidacja "Nowe === Potwierdź" robi się client-side jako prewencyjny gate przed wysłaniem requestu (przeważnie tak — better-auth sprawdza tylko `currentPassword` i `newPassword`, nie ma pojęcia o "potwierdź"). **Wyjątek od D-10:** sprawdzenie `newPassword === confirmPassword` musi być client-side, bo nie ma odpowiednika na serwerze; reszta walidacji pozostaje server-side.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 1: Settings Shell + Konto" — goal + 5 success criteria
- `.planning/REQUIREMENTS.md` §Settings (SET-01..SET-05) + §"Frontend stability" FE-07 — wszystkie 6 requirementów tej fazy
- `.planning/PROJECT.md` §"Key Decisions" — Settings page as side-nav + content (Linear-style) decision

### Project conventions (must follow)
- `CLAUDE.md` — full project rules (stack constraints, conventions, naming, layered architecture)
- `.planning/codebase/CONVENTIONS.md` — code conventions
- `.planning/codebase/STRUCTURE.md` §"Where to Add New Code" — new client page recipe
- `.planning/codebase/ARCHITECTURE.md` — hexagonal layering (this phase is client-only, no domain/infra changes)

### Cross-cutting user preferences (MEMORY)
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_layout_style.md` — pełnoekranowe layouty, nie wycentrowane
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_better_auth_session_refetch.md` — `await refetchSession()` przed `navigate` po revoke-sessions/sign-out
- `~/.claude/projects/-Users-kodari-projects-games/memory/feedback_react_autofill_uncontrolled.md` — credential forms używają uncontrolled + FormData

### Existing code touchpoints
- `apps/client/src/main.tsx` — router tree; dodanie nested route `/settings`
- `apps/client/src/pages/login.tsx` — wzorzec form (uncontrolled + FormData + error/pending state); password-form ma go skopiować
- `apps/client/src/components/layout/sidebar.tsx:104-166` — `UserCard.onLogout` pokazuje pattern `signOut` + `removeQueries` + `navigate('/login')`; `revokeSessions` flow w D-16 jest jego pochodną
- `apps/client/src/lib/auth-client.ts` — single source dla auth-client exports; dodaj `changePassword`, `revokeSessions`
- `apps/client/src/components/auth/protected-route.tsx` — istniejący guard; bez zmian
- `apps/client/src/components/layout/app-layout.tsx` — `<Outlet />` host; settings ląduje pod nim
- `apps/api/src/infrastructure/auth/auth.ts` — config better-auth; `changePassword` i `revokeSessions` są by-default aktywne, **bez zmian**

### Stack docs (use Context7 jeśli planner potrzebuje API details)
- better-auth React client: `/better-auth/better-auth` (Context7) — `changePassword`, `revokeSessions`, `useSession.refetch`
- react-router-dom v6: nested routes + `<Outlet />`, `<Navigate>` w `index` route
- shadcn/ui `alert-dialog`, `card`, `label` (jeśli nie ma) — install przez `bunx shadcn@latest add <name>` w `apps/client/`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`useSession` from `@/lib/auth-client`**: zwraca `{ data: { user: { email, name, ... } } }`. Używane w `sidebar.tsx:105`. Wymaga `refetch` wyciąganego oddzielnie: `const { data: session, refetch: refetchSession } = useSession()`.
- **`apps/client/src/pages/login.tsx`**: kanoniczny wzorzec form pattern dla Phase 1 (uncontrolled + FormData + useState dla error/pending). **NIE wyciągamy** `useCredentialsForm` hooka — to scope Phase 4 (FE-02). Phase 1 powiela pattern manualnie; Phase 4 wyciąga helper.
- **`sidebar.tsx` UserCard.onLogout (linie 114-118)**: blueprint dla revoke-sessions cleanup (signOut → removeQueries → navigate). D-16 to jego pochodna z `refetchSession` w środku.
- **`toaster` z `sonner`** już zamontowany w `main.tsx:17` (`<Toaster richColors position="top-center" />`). Import: `import { toast } from 'sonner'`.
- **Tailwind tokens `apex-*`** (z `tailwind.config.js` + `index.css`): `apex-ink`, `apex-ink-3`, `apex-muted`, `apex-hint`, `apex-accent`, `apex-line-4`, `apex-line-5`, `apex-surface-hover`, `apex-surface-chip`. Settings nav i karty muszą używać tych tokenów dla wizualnej spójności.
- **shadcn primitives już zainstalowane**: `button`, `checkbox`, `input`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `textarea`, `tooltip`. **DO INSTALACJI:** `alert-dialog`, `card`, `label` (sprawdzić `apps/client/src/components/ui/`).
- **`@radix-ui/react-dropdown-menu`** już w deps (`sidebar.tsx:14`) — gdyby AlertDialog primitive shadcna miał problemy, można fallback'ować na bare Radix `@radix-ui/react-alert-dialog`.

### Established Patterns
- **Kebab-case files, PascalCase exports** — `account.tsx` exports `AccountPage`, `settings-layout.tsx` exports `SettingsLayout`. Konwencja z STRUCTURE.md §Naming Conventions.
- **Named exports only** — żadnego `export default` (zgodnie z CLAUDE.md > Module Design).
- **No barrel `index.ts`** w client — bezpośrednie importy przez `@/pages/settings/account` itd.
- **Pages w `pages/`, layouts w `components/layout/`** — **wyjątek w tej fazie**: settings-layout siedzi w `pages/settings/` razem ze swoimi pod-stronami (zgodnie z patternem "tightly coupled siblings" z STRUCTURE.md — analogicznie do `games-columns.tsx` koło `games.tsx`). Settings nav jest tightly coupled do SettingsLayout, więc też tam siedzi.
- **Forma uncontrolled + FormData + useState dla error/pending** — wzorzec `login.tsx:14-36`.
- **Error UI inline w czerwonym bannerze** — wzorzec `login.tsx:43-47` (`border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800`).
- **`navigate('/login', { replace: true })`** — wzorzec z `sidebar.tsx:118`. `replace: true` żeby user nie wrócił "wstecz" do `/settings`.

### Integration Points
- **`main.tsx` router tree (linie 20-57)** — wstawiamy nową ścieżkę `/settings` pod `AppLayout.children`:
  ```ts
  {
    path: 'settings',
    element: <SettingsLayout />,
    children: [
      { index: true, element: <Navigate to="account" replace /> },
      { path: 'account', element: <AccountPage /> },
    ],
  }
  ```
  Usuwamy aktualny `{ path: 'settings', element: <Placeholder title="Settings" /> }` (linia 43). Placeholder w `main.tsx:59-65` zostaje (jeszcze używa go `/support`).
- **`auth-client.ts`** — dopisanie `changePassword`, `revokeSessions` do destrukturyzowanego eksportu.
- **`AppLayout` `<Outlet />` (`app-layout.tsx:15`)** — settings ląduje w nim automatycznie; **bez zmian w AppLayout**.
- **Style globals** — bez zmian w `index.css` / `tailwind.config.js`; tylko używamy istniejących utilities.

### Out-of-scope w tej fazie (świadomie nie ruszamy)
- `apps/api/src/**` — żadnych zmian na backendzie (better-auth ma już potrzebne endpointy).
- `useCredentialsForm` hook — owned by Phase 4 (FE-02), tu kopiujemy pattern z `login.tsx`.
- Globalny ErrorBoundary (FE-01 → Phase 4) — error w settings może crashnąć SPA do czasu Phase 4; akceptowalne, single-user dev.
- CSRF / rate-limit (Phase 3) — `changePassword` / `revokeSessions` używają mechanizmu better-auth (już rate-limited domyślnie w `auth.ts:23-31` window=60s, max=100).

</code_context>

<specifics>
## Specific Ideas

- **Brand:** Linear/Raycast — gęstość z oddechem, dane mówią same za siebie. Settings strona nie ma być "zarząd panelu kontrolnego" — ma być spokojna, czytelna, neutralna paleta.
- **Język:** wszystkie user-facing stringi po polsku. Labels: "Aktualne hasło", "Nowe hasło", "Potwierdź nowe hasło", "Wyloguj wszystkie inne sesje", "Zapisz", "Wyloguj wszystkie sesje", "Anuluj", "Wkrótce", "Email", "Konto", "Profil", "Bezpieczeństwo", "Zmień hasło", "Integracje", "Dane", "Wygląd", "Pozostałe". Toast: "Hasło zmienione".
- **Wizualna inspiracja:** Linear settings panel (https://linear.app/settings) — secondary sidebar po lewej, karty/sekcje w stack po prawej, hierarchia przez spacing i typography, nie przez kolor.
- **Card style:** padding ~24px, border `apex-line-4` lub `apex-line-5`, rounded ~8px, bg białe. Tytuł karty (h3) 14-15px semibold, opcjonalny subtitle 13px muted.

</specifics>

<deferred>
## Deferred Ideas

- **`useCredentialsForm` hook** — wyciąg wspólnego pattern login/register/change-password do reusable hooka. → **Phase 4** (FE-02).
- **Sekcja Integracje** — UI panel integracji z IGDB credentials. → **Phase 2** (INT-01..INT-08).
- **Sekcja Dane** — eksport/import w UI, "usuń wszystko". → **v2** (SET-V2-01).
- **Sekcja Wygląd** — tryb jasny/ciemny, gęstość tabel. → **v2** (SET-V2-02).
- **Edit name/avatar** — better-auth wspiera `updateUser({ name })`, ale poza zakresem PROJECT.md (Email tylko read-only).
- **2FA / passkeys** — out of scope całego milestone'u; brak wzmianki w PROJECT.md.
- **Pokazywanie listy aktywnych sesji** (z device-info, last-seen) — better-auth zwraca `listSessions()`, ale wymaga osobnej UI; deferred.
- **Strength meter dla hasła** — over-engineered dla single-user; deferred / never.

</deferred>

---

*Phase: 1-Settings Shell + Konto*
*Context gathered: 2026-05-12*
