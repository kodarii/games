# Auth (rejestracja + logowanie) — Faza 3: Frontend (better-auth/react client)

## Goal
Zintegruj UI logowania/rejestracji z API better-auth używając klienta `better-auth/react`:
- Strony `/login` i `/register` (split-screen layout z brandingiem po lewej, formularz po prawej)
- `authClient.useSession()` jako single source of truth o stanie auth (zastępuje custom `useCurrentUser`)
- `<ProtectedRoute />` przekierowujący niezalogowanych na `/login`
- Logout z poziomu sidebara
- Wszystkie istniejące fetch'e w `api.ts` z `credentials: 'include'`
- Po sukcesie register/login: `Navigate` na `/games`

**Dlaczego `better-auth/react`:** klient daje gotowy reaktywny `useSession()` (nano-store internally), `signIn.email`, `signUp.email`, `signOut` z wbudowanym error handlingiem (typed `error.code`), CSRF protection, automatyczne `credentials: 'include'`. Nie piszemy własnych hooków TanStack Query do `/api/auth/me` — biblioteka to robi lepiej.

## Definition of Done
- [ ] `bun run --filter '*' typecheck` czyste
- [ ] `bun run lint` czyste
- [ ] Niezalogowany user wchodzący na `/games` przekierowany na `/login`
- [ ] Po sukcesie rejestracji user automatycznie zalogowany (better-auth `autoSignIn: true` z fazy 1) i na `/games`
- [ ] Po sukcesie logowania user na `/games` (lub na `state.from` jeśli był redirect z protected route)
- [ ] Wylogowanie kliknięciem w sidebar przekierowuje na `/login`
- [ ] Błąd `USER_ALREADY_EXISTS` z backendu wyświetla się inline pod polem email
- [ ] Błąd `INVALID_EMAIL_OR_PASSWORD` z backendu wyświetla się jako general error nad formularzem
- [ ] Strony login/register są w pełni klawiaturowe (Tab, Enter submit) i mają widoczny focus
- [ ] Nie ma flash niezalogowanego stanu — `<ProtectedRoute>` pokazuje spinner dopóki `useSession` w `isPending`

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun add --cwd apps/client`, `bun run --filter '*' typecheck`, `bun run lint`)
**Stack klienta:** React 18 + Vite + TanStack Query v5 + react-router-dom v6 + Radix UI + Tailwind CSS + lucide-react. Dodajemy: `better-auth` (klient z `better-auth/react`).
**Wzorzec referencyjny:** `apps/client/src/lib/api.ts` (fetch helpers — taki sam wzorzec, dopisujemy `credentials: 'include'`), `apps/client/src/components/ui/{button,input}.tsx` (gotowe komponenty), `apps/client/src/pages/game-edit.tsx` (przykładowa strona z formularzem).
**Aliasy:** `@/...` to `apps/client/src/...` (Vite alias).

## Visual spec
**Layout stron auth (`AuthLayout`):** split-screen 50/50 na desktopie, single-column na mobile.
- **Lewa kolumna (desktop ≥ md):** ciemny panel `bg-apex-ink` (granat/czarny używany w sidebarze app), białe logo `Apex` na górze (ten sam `Icon.logoMark` co w sidebarze, tylko duży 40px), pod logo headline `Track every game you play.` w `text-3xl font-semibold text-white`, niżej subline `Your library, your stats — all in one place.` w `text-base text-white/70`. Centred vertically. Padding `p-12`. Hidden na `<md` przez `hidden md:flex`.
- **Prawa kolumna:** białe tło, max-w-[420px], centred vertically + horizontally. Na mobile: ten sam content, ale full width z paddingiem `px-6 py-12`. Logo + nazwa Apex pojawiają się na górze TYLKO na mobile (`md:hidden`).
- **Karta formularza:** brak ramki, brak shadow — tylko spacing. Tytuł `h1` (`text-2xl font-semibold text-apex-ink`), pod nim sub `text-sm text-apex-muted` (np. „Sign in to your account"). Spacing między tytułem a formularzem: `mt-2` na sub, `mt-8` na form.

**Formularz login:**
- Pole email (`<Input type="email" />`), label nad polem `text-sm font-medium text-apex-ink`.
- Pole password (`<Input type="password" />`), label.
- General error banner (jeśli jest): `mt-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800` z tekstem błędu (np. „Invalid email or password.").
- Field error: pod inputem `mt-1 text-xs text-red-600`.
- Submit button: pełna szerokość, `<Button type="submit" className="w-full mt-6">Sign in</Button>`. W stanie loading: tekst „Signing in…" + `disabled`.
- Pod buttonem: `mt-4 text-center text-sm text-apex-muted` z tekstem `Don't have an account? <Link to="/register" className="text-apex-accent font-medium hover:underline">Create one</Link>`.

**Formularz register:**
- Pola: **name**, email, password, confirm password.
- Walidacja klienta: name niepusty, email format (HTML5 `type=email`), password min 8, confirm === password. Inline pod polem.
- Submit button: „Create account".
- Pod buttonem: `Already have an account? <Link to="/login">Sign in</Link>`.

**Logout w sidebarze:**
- Aktualny `apps/client/src/components/layout/sidebar.tsx` ma user card na dole (`Arthur Taylor`, `arthur@apex.com`) — to placeholder. Zastąp realnymi danymi z `authClient.useSession()`. Display name z `session.user.name` (fallback `email.split('@')[0]`), email pełny pod spodem.
- Po kliknięciu w user card: pokaż menu (Radix DropdownMenu — już zainstalowany `@radix-ui/react-dropdown-menu@^2.1.2`). Items: `Sign out`. Po kliknięciu: `authClient.signOut()` + `Navigate('/login')`.

**Loading state ProtectedRoute:**
- `<div className="flex h-screen w-screen items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-apex-line-3 border-t-apex-ink" /></div>`. Bez tekstu.

### Step 0: Pobierz dokumentację
Użyj Context7 PRZED kodowaniem:
1. `better-auth` — pytanie: "createAuthClient from better-auth/react, useSession hook (data, isPending, error, refetch), signIn.email and signUp.email with onSuccess/onError callbacks, signOut, baseURL config, error.code field for typed errors"
2. `react-router-dom` v6 — pytanie: "useNavigate after async action, Navigate component for redirect, useLocation for from-redirect state, nested routes with Outlet, createBrowserRouter children"
3. `@radix-ui/react-dropdown-menu` — pytanie: "basic dropdown menu with Trigger asChild, Content, Item, onSelect handler, Portal"
4. (opcjonalnie) `tailwindcss` — pytanie: "responsive grid columns md breakpoint, h-screen layout, hidden md:flex pattern"

NIE pisz Radix DropdownMenu z pamięci ani API better-auth React clienta — pobierz dokładną składnię z Context7.

### Relevant files (edit only these)
- `apps/client/package.json` — dependency `better-auth` (taka sama wersja jak w `apps/api/package.json`)
- `apps/client/src/lib/auth-client.ts` — **NEW** — `createAuthClient({ baseURL })` + reeksport `signIn`, `signUp`, `signOut`, `useSession`
- `apps/client/src/lib/api.ts` — dopisz `credentials: 'include'` do KAŻDEGO fetch (istniejące i nowe). Reszta zostaje.
- `apps/client/src/components/layout/auth-layout.tsx` — **NEW** — split-screen layout z brandingiem po lewej, `<Outlet />` po prawej
- `apps/client/src/components/auth/protected-route.tsx` — **NEW** — wrapper sprawdzający `useSession`, spinner / redirect / `<Outlet />`
- `apps/client/src/pages/login.tsx` — **NEW**
- `apps/client/src/pages/register.tsx` — **NEW**
- `apps/client/src/components/layout/sidebar.tsx` — zastąp placeholder user card realnym `useSession` + DropdownMenu z „Sign out"
- `apps/client/src/main.tsx` — restruktur routingu: dodaj routes `/login`, `/register` pod `AuthLayout`; route'y appki zawiń w `<ProtectedRoute />`

### Files to read but NOT edit
- `apps/api/src/infrastructure/auth/auth.ts` — kontrakt API (faza 1+2): widzisz jaki `baseURL` i `trustedOrigins` ma backend
- `apps/client/src/lib/api.ts` (przed edycją) — wzorzec `fetchGames`, error handling
- `apps/client/src/lib/queries.ts` — TanStack hooks dla games (NIE ruszamy, pozostają jak są)
- `apps/client/src/lib/query-client.ts` — config `QueryClient`
- `apps/client/src/components/layout/app-layout.tsx` + `sidebar.tsx` — wzorzec layoutu app
- `apps/client/src/components/ui/{button,input}.tsx` — gotowe komponenty UI do reużycia
- `apps/client/src/main.tsx` (przed edycją) — obecny routing

## Constraints
- NIE pisz własnego `useCurrentUser()` w `queries.ts`, NIE pisz własnego `meApi`/`loginApi`/`registerApi`/`logoutApi` w `api.ts`. Tę pracę robi `authClient` z better-auth. Jeśli widzisz takie funkcje (z poprzedniej iteracji planu) — usuń.
- NIE pisz Tailwind/Radix z pamięci — TYLKO z docs Context7 (Step 0).
- Wszystkie ISTNIEJĄCE fetch w `api.ts` (`fetchGames`, `fetchGame`, `createGame`, `updateGame`, `deleteGame`) MUSZĄ dostać `credentials: 'include'` — bez tego cookie sesji better-auth nie pójdzie do backendu, dostaniesz 401 na games.
- `authClient.baseURL` MUSI matchować backend (`http://localhost:3001` w dev). Jeśli używasz Vite proxy (sprawdź `apps/client/vite.config.ts`) — wtedy `baseURL` może być relatywne (`'/'` albo nieobecne) i wszystko jest same-origin. Wybierz JEDNĄ ścieżkę.
- ProtectedRoute: `if (isPending) return <Spinner />; if (!session?.user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;` — `replace` żeby Back nie wracał do chronionej strony.
- Po `signIn.email` success w `LoginPage`: `navigate(location.state?.from ?? '/games', { replace: true })`. Po `signUp.email` success: `navigate('/games', { replace: true })` (świeży user, bez from).
- Brak custom CSS — TYLKO Tailwind utility classes (i istniejące tokeny `apex-*` z `tailwind.config`).
- NIE używaj `react-hook-form` ani innych form libów — projekt ich nie ma. Goły `useState` + handlery wystarczą.
- NIE wrzucaj logiki do JSX — `useSession`, sign-in/up callbacks → handlery w hookach komponentów. Komponenty są prezentacyjne. Jeśli `LoginPage` ma >100 linii → wydziel `<LoginForm />` jako sub-komponent.
- Po wylogowaniu wyczyść cache TanStack Query dla games: `queryClient.removeQueries({ queryKey: ['games'] })` żeby user B nie zobaczył cache usera A. Dla useSession to nie potrzebne — better-auth czyści wewnętrznie.

## Steps

### Step 1: Install + auth-client + credentials
**Pliki:** `apps/client/package.json`, `apps/client/src/lib/auth-client.ts`, `apps/client/src/lib/api.ts`

**Co robimy:**
1. `bun add --cwd apps/client better-auth` — wersja MUSI być spójna z backend (`apps/api/package.json`). Jeśli różne — TS może narzekać na typy session, a klient i serwer mogą się rozjeżdżać.
2. Stwórz `apps/client/src/lib/auth-client.ts`:
   ```ts
   import { createAuthClient } from 'better-auth/react';

   export const authClient = createAuthClient({
     baseURL: 'http://localhost:3001',
   });

   export const { signIn, signUp, signOut, useSession } = authClient;
   ```
   (Jeśli `apps/client/vite.config.ts` ma proxy `/api → http://localhost:3001` — usuń `baseURL` lub ustaw na window.location.origin. Sprawdź config Vite. W repo na ten moment proxy NIE jest skonfigurowane — więc absolute URL.)
3. Edytuj `apps/client/src/lib/api.ts` — do KAŻDEGO `fetch(...)` dopisz `credentials: 'include'`. Konkretnie:
   - `fetchGames`: `fetch('/api/games?...', { credentials: 'include' })`
   - `fetchGame`: `fetch('/api/games/${id}', { credentials: 'include' })`
   - `createGame`: w opcjach `{ method: 'POST', credentials: 'include', headers: ..., body: ... }`
   - `updateGame`: analogicznie
   - `deleteGame`: `fetch('/api/games/${id}', { method: 'DELETE', credentials: 'include' })`
   - **WAŻNE:** ścieżki w `api.ts` są relatywne (`'/api/games'`). To znaczy że client musi mieć Vite proxy (cross-origin do 3001 wymaga absolute URL lub proxy). Sprawdź `apps/client/vite.config.ts`. Jeśli proxy nie ma — DODAJ:
     ```ts
     // vite.config.ts
     server: {
       proxy: {
         '/api': { target: 'http://localhost:3001', changeOrigin: true },
       },
     },
     ```
     Z proxy WSZYSTKIE requesty są same-origin (do localhost:5173 → proxy → 3001) i `credentials: 'include'` działa bez cors hassle. Wtedy `auth-client.ts` może mieć `baseURL: 'http://localhost:5173'` ALBO nie mieć `baseURL` wcale (defaultowo window.location).
   - Wybierz JEDNO podejście:
     - **A) Absolute URLs + cors+credentials** — `auth-client.ts` ma `baseURL: 'http://localhost:3001'`, `api.ts` używa absolute `http://localhost:3001/api/...`, backend ma `cors({ credentials: true, origin: 'http://localhost:5173' })`.
     - **B) Vite proxy (preferowane)** — `auth-client.ts` ma `baseURL: 'http://localhost:5173'` (domyślne), `api.ts` używa relative `/api/...`, backend dalej ma cors (defensywnie).
   - **Wybór: B (Vite proxy)** — mniej konfiguracji, mniej rzeczy do zepsucia. Implementuj proxy w `vite.config.ts` jeśli nie ma.
4. `bun run --filter '*' typecheck` — czyste.

**Rezultat:** Klient better-auth zainicjalizowany, fetchy mają cookie, proxy zestawione (jeśli było potrzebne).

### Step 2: AuthLayout + ProtectedRoute + reorganizacja routingu
**Pliki:** `apps/client/src/components/layout/auth-layout.tsx`, `apps/client/src/components/auth/protected-route.tsx`, `apps/client/src/main.tsx`

**Co robimy:**
1. Stwórz katalog: `mkdir -p apps/client/src/components/auth`.
2. `auth-layout.tsx`:
   ```tsx
   import { Outlet } from 'react-router-dom';
   import { Icon } from '@/components/icons';

   export function AuthLayout() {
     return (
       <div className="flex min-h-screen w-screen bg-white">
         <aside className="hidden md:flex md:w-1/2 flex-col justify-center bg-apex-ink p-12 text-white">
           <div className="flex items-center gap-3">
             <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
               <Icon.logoMark size={22} />
             </div>
             <span className="text-xl font-semibold">Apex</span>
           </div>
           <h1 className="mt-12 text-3xl font-semibold leading-tight">Track every game you play.</h1>
           <p className="mt-3 max-w-md text-base text-white/70">Your library, your stats — all in one place.</p>
         </aside>
         <main className="flex w-full flex-col items-center justify-center px-6 py-12 md:w-1/2">
           <div className="w-full max-w-[420px]">
             <Outlet />
           </div>
         </main>
       </div>
     );
   }
   ```
   (Sprawdź czy `Icon.logoMark` istnieje w `@/components/icons` — jeśli inny export, użyj tego co jest. Cel: ikona Apex.)
3. `protected-route.tsx`:
   ```tsx
   import { Navigate, Outlet, useLocation } from 'react-router-dom';
   import { useSession } from '@/lib/auth-client';

   export function ProtectedRoute() {
     const { data: session, isPending } = useSession();
     const location = useLocation();
     if (isPending) {
       return (
         <div className="flex h-screen w-screen items-center justify-center">
           <div className="h-6 w-6 animate-spin rounded-full border-2 border-apex-line-3 border-t-apex-ink" />
         </div>
       );
     }
     if (!session?.user) {
       return <Navigate to="/login" replace state={{ from: location.pathname }} />;
     }
     return <Outlet />;
   }
   ```
4. `main.tsx` — restruktur routingu:
   ```tsx
   import { AppLayout } from '@/components/layout/app-layout';
   import { AuthLayout } from '@/components/layout/auth-layout';
   import { ProtectedRoute } from '@/components/auth/protected-route';
   import { queryClient } from '@/lib/query-client';
   import { GameEditPage } from '@/pages/game-edit';
   import { GameNewPage } from '@/pages/game-new';
   import { GameViewPage } from '@/pages/game-view';
   import { GamesPage } from '@/pages/games';
   import { LoginPage } from '@/pages/login';
   import { RegisterPage } from '@/pages/register';
   import { QueryClientProvider } from '@tanstack/react-query';
   import React from 'react';
   import ReactDOM from 'react-dom/client';
   import { Navigate, RouterProvider, createBrowserRouter } from 'react-router-dom';
   import './index.css';

   const router = createBrowserRouter([
     {
       element: <AuthLayout />,
       children: [
         { path: '/login', element: <LoginPage /> },
         { path: '/register', element: <RegisterPage /> },
       ],
     },
     {
       element: <ProtectedRoute />,
       children: [
         {
           path: '/',
           element: <AppLayout />,
           children: [
             { index: true, element: <Navigate to="/games" replace /> },
             { path: 'games', element: <GamesPage /> },
             { path: 'games/new', element: <GameNewPage /> },
             { path: 'games/:id', element: <GameViewPage /> },
             { path: 'games/:id/edit', element: <GameEditPage /> },
             { path: 'settings', element: <Placeholder title="Settings" /> },
             { path: 'support', element: <Placeholder title="Support" /> },
           ],
         },
       ],
     },
   ]);

   function Placeholder({ title }: { title: string }) { /* ... bez zmian ... */ }

   ReactDOM.createRoot(document.getElementById('root')!).render(
     <React.StrictMode>
       <QueryClientProvider client={queryClient}>
         <RouterProvider router={router} />
       </QueryClientProvider>
     </React.StrictMode>,
   );
   ```
5. `bun run --filter '*' typecheck` — czyste (LoginPage / RegisterPage jeszcze nie istnieją → import error). Stwórz placeholdery (`export function LoginPage() { return <div>login todo</div>; }`) jeśli typecheck blokuje, a potem zastąp pełną implementacją w Step 3.

**Rezultat:** Routing oddziela publiczne (auth) od chronionych. ProtectedRoute działa. AuthLayout renderuje split-screen.

### Step 3: LoginPage + RegisterPage
**Pliki:** `apps/client/src/pages/login.tsx`, `apps/client/src/pages/register.tsx`

**Co robimy:**
1. `LoginPage`:
   ```tsx
   import { useState } from 'react';
   import { Link, useLocation, useNavigate } from 'react-router-dom';
   import { Button } from '@/components/ui/button';
   import { Input } from '@/components/ui/input';
   import { signIn } from '@/lib/auth-client';

   export function LoginPage() {
     const navigate = useNavigate();
     const location = useLocation();
     const [email, setEmail] = useState('');
     const [password, setPassword] = useState('');
     const [error, setError] = useState<string | null>(null);
     const [isPending, setIsPending] = useState(false);

     const onSubmit = async (e: React.FormEvent) => {
       e.preventDefault();
       setError(null);
       setIsPending(true);
       const { error: signInError } = await signIn.email({ email, password });
       setIsPending(false);
       if (signInError) {
         setError(
           signInError.code === 'INVALID_EMAIL_OR_PASSWORD'
             ? 'Invalid email or password.'
             : 'Something went wrong. Try again.',
         );
         return;
       }
       const from = (location.state as { from?: string } | null)?.from ?? '/games';
       navigate(from, { replace: true });
     };

     return (
       <div>
         <h1 className="text-2xl font-semibold text-apex-ink">Welcome back</h1>
         <p className="mt-2 text-sm text-apex-muted">Sign in to your Apex account.</p>

         {error && (
           <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
             {error}
           </div>
         )}

         <form onSubmit={onSubmit} className="mt-8 space-y-4">
           <div>
             <label htmlFor="email" className="text-sm font-medium text-apex-ink">Email</label>
             <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
           </div>
           <div>
             <label htmlFor="password" className="text-sm font-medium text-apex-ink">Password</label>
             <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
           </div>
           <Button type="submit" className="w-full" disabled={isPending}>
             {isPending ? 'Signing in…' : 'Sign in'}
           </Button>
         </form>

         <p className="mt-4 text-center text-sm text-apex-muted">
           Don't have an account?{' '}
           <Link to="/register" className="font-medium text-apex-accent hover:underline">Create one</Link>
         </p>
       </div>
     );
   }
   ```
2. `RegisterPage`: analogicznie, ale:
   - Pola: `name`, `email`, `password`, `confirmPassword`.
   - Pre-submit walidacja: `name.trim().length > 0`, `password.length >= 8`, `password === confirmPassword`. Jeśli któraś nie pasuje → set field error pod polem, NIE wywołuj `signUp.email`.
   - Wywołanie: `await signUp.email({ email, password, name })`.
   - Error mapping: `error.code === 'USER_ALREADY_EXISTS'` → field error pod polem email „This email is already registered." Inne błędy → general banner „Something went wrong. Try again."
   - Po sukcesie: `navigate('/games', { replace: true })`. Backend ma `autoSignIn: true` (faza 1) — cookie ustawione, `useSession` w innych komponentach automatycznie się odświeży.
   - Link na dole: „Already have an account? Sign in" → `/login`.
3. Sanity:
   - `bun run --filter '*' typecheck`, `bun run lint` czyste.
   - Uruchom `bun run --cwd apps/api dev` + `bun run --cwd apps/client dev`.
   - Manual test: `/register` → wypełnij → sukces → `/games` (lista pusta dla nowego usera, ale endpoint odpowiada 200).
   - Wyloguj się (faza step 4) i wróć na `/login` → wypełnij → `/games`.

**Rezultat:** Strony auth działają end-to-end, po sukcesie user jest w aplikacji.

### Step 4: Sidebar — realny user + Sign out
**Pliki:** `apps/client/src/components/layout/sidebar.tsx`

**Co robimy:**
1. Czytaj sesję z `authClient.useSession()`. Sidebar renderuje się tylko pod `ProtectedRoute`, więc `session?.user` gwarantowany — ale dla TS użyj guard'a:
   ```tsx
   const { data: session } = useSession();
   const user = session?.user;
   if (!user) return null; // defensive — w praktyce ProtectedRoute już wyfiltrował
   const display = user.name?.trim() || user.email.split('@')[0];
   ```
2. Owrap istniejącą user card w `DropdownMenu` (Radix). UI:
   ```tsx
   import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
   import { useNavigate } from 'react-router-dom';
   import { useQueryClient } from '@tanstack/react-query';
   import { signOut, useSession } from '@/lib/auth-client';

   const navigate = useNavigate();
   const qc = useQueryClient();

   const onLogout = async () => {
     await signOut();
     qc.removeQueries({ queryKey: ['games'] }); // wyczyść cache poprzedniego usera
     navigate('/login', { replace: true });
   };

   <DropdownMenu.Root>
     <DropdownMenu.Trigger asChild>
       <button className="...obecne klasy user card jako button...">
         {/* avatar + display + email + chevron */}
       </button>
     </DropdownMenu.Trigger>
     <DropdownMenu.Portal>
       <DropdownMenu.Content
         side="top" align="start" sideOffset={6}
         className="z-50 min-w-[200px] rounded-lg border border-apex-line-4 bg-white p-1 shadow-lg"
       >
         <DropdownMenu.Item
           className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-apex-ink outline-none hover:bg-apex-surface-hover"
           onSelect={(e) => { e.preventDefault(); onLogout(); }}
         >
           Sign out
         </DropdownMenu.Item>
       </DropdownMenu.Content>
     </DropdownMenu.Portal>
   </DropdownMenu.Root>
   ```
   (Dokładną składnię Radix v2 weryfikuj z Context7 — Trigger może wymagać `asChild`, Item może mieć `onSelect`/`onClick` zależnie od wersji. `e.preventDefault()` w `onSelect` zapobiega autoclose przed navigate.)
3. Końcowy run:
   - `bun run --filter '*' typecheck`
   - `bun run lint`
   - Manual test: zalogowany user widzi swój `name`/`email` w sidebarze. Klik → menu → Sign out → przekierowanie na `/login`. Otwarcie nowej karty na `/games` → redirect na `/login`.

**Rezultat:** Pełen flow: register → app → logout → login → app. Faza 3 zamknięta.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Typowe pułapki:
- Cookie nie wysyła się do backendu — sprawdź WSZYSTKIE fetch w `api.ts` mają `credentials: 'include'`. Bez tego nawet same-origin może nie działać w niektórych konfiguracjach Vite proxy.
- Vite dev server na 5173, API na 3001 — to różne origins. Wybierz JEDNĄ ścieżkę: ALBO Vite proxy `/api → 3001` w `vite.config.ts` (preferowane), ALBO absolute URLs + backend cors `credentials: true` + frontend `credentials: 'include'`. Mieszanie się gryzie.
- 403 z `/api/auth/sign-in/email` mimo poprawnych danych — `Origin` requestu nie matchuje `trustedOrigins` w backend `auth.ts`. Sprawdź faza 1, lista origin musi zawierać `http://localhost:5173`. Z proxy Vite — origin requestu to 5173, więc OK.
- `useSession` zwraca `data: null` po `signIn.email` success — better-auth client cache nie odświeżył się. Sprawdź wersję better-auth — w nowszych klient sam triggeruje invalidację. Workaround: po `signIn.email` zawołaj `await authClient.getSession()` przed `navigate`. Jeśli nadal nie działa: ProtectedRoute przeładuje się przy navigate i fetchnie świeżą sesję.
- ProtectedRoute pokazuje spinner wiecznie — `useSession` w `isPending: true`. Sprawdź devtools network: czy `/api/auth/get-session` zwraca cokolwiek (200/401)? Jeśli 200 ale `data: null` → user nie zalogowany (poprawnie, redirect na /login). Jeśli wisi → backend nie odpowiada (sprawdź czy `bun run dev` działa).
- `signIn.email` rzuca CORS error w konsoli przeglądarki — backend nie ma `cors({ credentials: true, origin: '...' })` ALBO origin frontu nie jest na liście `trustedOrigins`. Sprawdź fazę 2 step 2 (cors config).
- TypeScript narzeka na `signIn.email` parameters — wersja better-auth różni się. Pobierz z Context7 dokładną sygnaturę dla zainstalowanej wersji.
- Po logout w innej karcie nadal widać `/games` — TanStack Query ma stary cache `['games']`. Rozwiązanie: w handlerze logout w sidebarze: `qc.removeQueries({ queryKey: ['games'] })` PRZED `navigate`. Pełna sync między kartami to osobny PR (BroadcastChannel / `useSession` poll on focus).
- Radix DropdownMenu nie zamyka się po Sign out przed `navigate` — `onSelect={(e) => { e.preventDefault(); onLogout(); }}` zapobiega autoclose, ale po await sign-out trzeba zamknąć Root state lub po prostu navigate (re-render zniszczy menu). Zwykle Radix sam zamyka, jeśli nie — zaakceptuj 100ms flicker, to nie blocker.
- Lint krzyczy o `(location.state as any)` — używamy poprawnie typowanego cast: `(location.state as { from?: string } | null)?.from`. Bez `any` powinno przejść.
