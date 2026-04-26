# Auth (rejestracja + logowanie) — Faza 3: Frontend

## Goal
Zbuduj UI do logowania i rejestracji oraz zintegruj zarządzanie sesją w kliencie:
- Strony `/login` i `/register` (split-screen layout z brandingiem po lewej, formularz po prawej)
- TanStack Query hook `useCurrentUser()` jako single source of truth o stanie auth
- `<ProtectedRoute />` przekierowujący niezalogowanych na `/login`
- Logout z poziomu sidebara
- Wszystkie wywołania API z `credentials: 'include'`
- Po sukcesie register/login: invalidate `['auth','me']` i `Navigate` na `/games`

## Definition of Done
- [ ] `bun run --filter '*' typecheck` czyste
- [ ] `bun run lint` czyste
- [ ] Niezalogowany user wchodzący na `/games` jest przekierowywany na `/login` (z `?from=/games` w query, opcjonalnie)
- [ ] Po sukcesie rejestracji user automatycznie zalogowany i na `/games`
- [ ] Po sukcesie logowania user na `/games` (lub na `?from=...` jeśli był redirect)
- [ ] Wylogowanie kliknięciem w sidebar przekierowuje na `/login`
- [ ] Błąd `email_taken` z backendu wyświetla się inline pod polem email
- [ ] Błąd `invalid_credentials` z backendu wyświetla się jako general error nad formularzem
- [ ] Strony login/register są w pełni klawiaturowe (Tab, Enter submit) i mają widoczny focus
- [ ] Nie ma flash niezalogowanego stanu — `<ProtectedRoute>` pokazuje spinner dopóki `useCurrentUser` ładuje

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm — `bun run --filter '*' typecheck`, `bun run lint`)
**Stack klienta:** React 18 + Vite + TanStack Query v5 + react-router-dom v6 + Radix UI + Tailwind CSS + lucide-react. NIE instaluj nowych UI bibliotek.
**Wzorzec referencyjny:** `apps/client/src/lib/api.ts` (fetch helpers — taki sam wzorzec dla auth), `apps/client/src/lib/queries.ts` (TanStack hooks), `apps/client/src/components/ui/{button,input}.tsx` (gotowe komponenty), `apps/client/src/pages/game-edit.tsx` (przykładowa strona z formularzem).
**Typy / aliasy:** import `@/...` to `apps/client/src/...` (Vite alias).

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
- Pola: email, password, confirm password.
- Validacja po stronie klienta: email format (HTML5 `type=email` + simple regex check), password min 8, confirm === password. Inline pod polem.
- Submit button: „Create account".
- Pod buttonem: `Already have an account? <Link to="/login">Sign in</Link>`.

**Logout w sidebarze:**
- Aktualny `apps/client/src/components/layout/sidebar.tsx` ma user card na dole (`Arthur Taylor`, `arthur@apex.com`) — to placeholder. Zastąp go realnymi danymi z `useCurrentUser()`. Nazwę bierz z `user.email` (przed `@`), email pełny pod spodem.
- Po kliknięciu w user card: pokaż menu (Radix DropdownMenu — już zainstalowany `@radix-ui/react-dropdown-menu`). Items: `Sign out`. Po kliknięciu: `useLogoutMutation()` → `Navigate('/login')`.

**Loading state ProtectedRoute:**
- `<div className="flex h-screen w-screen items-center justify-center"><div className="h-6 w-6 animate-spin rounded-full border-2 border-apex-line-3 border-t-apex-ink" /></div>`. Bez tekstu.

**Komponenty Radix (Step 0):**
- `@radix-ui/react-dropdown-menu` — dla menu „Sign out". Już zainstalowany, sprawdź docs do wersji w `package.json`.

### Step 0: Pobierz dokumentację
Użyj Context7 PRZED pisaniem kodu:
1. `@tanstack/react-query` v5 — pytanie: "useQuery with retry: false, useMutation with onSuccess invalidating other queries, queryClient.invalidateQueries"
2. `react-router-dom` v6 — pytanie: "useNavigate after mutation, Navigate component for redirect, useLocation for from-redirect, nested routes with Outlet"
3. `@radix-ui/react-dropdown-menu` — pytanie: "basic dropdown menu with trigger and items"
4. (opcjonalnie) `tailwindcss` — pytanie: "responsive grid columns md breakpoint, h-screen layout"

NIE pisz Radix DropdownMenu z pamięci — pobierz dokładną składnię imports/Trigger/Content/Item.

### Relevant files (edit only these)
- `apps/client/src/lib/api.ts` — dopisz `loginApi`, `registerApi`, `logoutApi`, `meApi`. WSZYSTKIE istniejące i nowe fetch'e dostają `credentials: 'include'` (żeby cookie się wysyłało / odbierało).
- `apps/client/src/lib/queries.ts` — dopisz `useCurrentUser()`, `useLoginMutation()`, `useRegisterMutation()`, `useLogoutMutation()`.
- `apps/client/src/types.ts` — dopisz typy `User`, `Session`, `AuthResponse`.
- `apps/client/src/components/layout/auth-layout.tsx` — **NEW** — split-screen layout z brandingiem po lewej, `<Outlet />` po prawej.
- `apps/client/src/components/auth/protected-route.tsx` — **NEW** — wrapper sprawdzający `useCurrentUser`, spinner / redirect / `<Outlet />`.
- `apps/client/src/components/auth/auth-form-field.tsx` — **NEW** (opcjonalnie) — wspólny field z label + input + error message. Jeśli `apps/client/src/components/form-field.tsx` jest reużywalny — użyj go zamiast tworzyć nowy.
- `apps/client/src/pages/login.tsx` — **NEW**
- `apps/client/src/pages/register.tsx` — **NEW**
- `apps/client/src/components/layout/sidebar.tsx` — zastąp placeholder user card realnym `useCurrentUser` + DropdownMenu z „Sign out".
- `apps/client/src/main.tsx` — restruktur routingu: dodaj routes `/login`, `/register` pod `AuthLayout`; route'y appki zawiń w `<ProtectedRoute />`.

### Files to read but NOT edit
- `apps/api/src/routes/auth.ts` — **kontrakt API** (faza 2): endpointy, request/response shape, status code'y. Z tego budujesz `api.ts`.
- `apps/api/src/routes/middleware/require-auth.ts` — pokazuje że 401 leci z `{ error: 'unauthorized' }`.
- `apps/client/src/lib/api.ts` (przed edycją) — wzorzec `fetchGames`, error handling.
- `apps/client/src/lib/queries.ts` — wzorzec hooków (jeśli istnieje; jeśli nie, czytaj jak `pages/games.tsx` używa `useQuery`).
- `apps/client/src/lib/query-client.ts` — config `QueryClient`.
- `apps/client/src/components/layout/app-layout.tsx` + `sidebar.tsx` — wzorzec layoutu app.
- `apps/client/src/components/ui/{button,input}.tsx` — gotowe komponenty UI do reużycia.
- `apps/client/src/main.tsx` (przed edycją) — obecny routing.

## Constraints
- NIE pisz Tailwind/Radix z pamięci — TYLKO z docs Context7 (Step 0).
- NIE wrzucaj logiki do JSX — `useCurrentUser`, `useLoginMutation` itp. to hooki, komponenty są prezentacyjne. Jeśli `LoginPage` ma >100 linii → wydziel `<LoginForm />` jako sub-komponent.
- Wszystkie fetch w `api.ts` muszą mieć `credentials: 'include'` (zarówno nowe jak i istniejące — bez tego cookie nie wsiądzie). To EDIT istniejących `fetchGames` / `createGame` / `updateGame` / `deleteGame` / `fetchGame` — dopisz `credentials: 'include'`.
- `useCurrentUser` query: `retry: false` (401 to NIE flaky network — to po prostu „nie zalogowany"), `staleTime: 5 * 60_000` (5 min), `gcTime: 30 * 60_000`. Po 401 zwracaj `null`, nie throw.
- W `useLoginMutation` / `useRegisterMutation`: `onSuccess` → `queryClient.setQueryData(['auth','me'], data.user)` ALBO `invalidateQueries({ queryKey: ['auth','me'] })`. Wybierz jedno (preferuj `setQueryData` — szybciej, mniej round-trip).
- W `useLogoutMutation`: `onSuccess` → `queryClient.setQueryData(['auth','me'], null)` + `queryClient.removeQueries({ queryKey: ['games'] })` (sesja innego usera nie powinna widzieć cache poprzedniego).
- ProtectedRoute: `if (isLoading) return <Spinner />; if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;` — `replace` żeby Back nie wracał do chronionej strony.
- Po `useLoginMutation` success w `LoginPage`: `navigate(location.state?.from ?? '/games', { replace: true })`. Po `useRegisterMutation` success: `navigate('/games', { replace: true })` (świeży user, bez from).
- Brak custom CSS — TYLKO Tailwind utility classes (i istniejące tokeny `apex-*` z `tailwind.config`).
- NIE używaj `react-hook-form` ani innych form libów — projekt ich nie ma. Goły `useState` + handlery wystarczą.

## Steps

### Step 1: API client + TanStack hooks
**Pliki:** `apps/client/src/types.ts`, `apps/client/src/lib/api.ts`, `apps/client/src/lib/queries.ts`

**Co robimy:**
1. W `types.ts` dopisz:
   ```ts
   export interface User { id: string; email: string; createdAt: string; }
   export interface SessionDto { token: string; userId: string; expiresAt: string; createdAt: string; }
   export interface AuthResponse { user: User; session: SessionDto; }
   ```
2. W `api.ts` (EDIT istniejący):
   - Do KAŻDEGO istniejącego `fetch(...)` dopisz `credentials: 'include'`.
   - Dopisz nowe funkcje:
     ```ts
     export async function meApi(): Promise<User | null> {
       const r = await fetch('/api/auth/me', { credentials: 'include' });
       if (r.status === 401) return null;
       if (!r.ok) throw new Error(`Failed to fetch user: ${r.status}`);
       const body = await r.json();
       return body.user;
     }

     export async function loginApi(input: { email: string; password: string }): Promise<AuthResponse> {
       const r = await fetch('/api/auth/login', {
         method: 'POST', credentials: 'include',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(input),
       });
       if (!r.ok) {
         const body = await r.json().catch(() => ({}));
         throw new ApiError(r.status, body?.error ?? 'login_failed', body);
       }
       return r.json();
     }
     // analogicznie registerApi (POST /api/auth/register)
     // analogicznie logoutApi (POST /api/auth/logout, no body, status 204 → return)
     ```
   - Dodaj klasę `ApiError extends Error { constructor(public status: number, public code: string, public body?: unknown) { super(code); } }` na górze pliku — pozwoli komponentom rozróżnić `email_taken` (409) od `invalid_credentials` (401) bez parsowania message.
3. W `queries.ts`:
   ```ts
   import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
   import { meApi, loginApi, registerApi, logoutApi } from './api';

   export const authMeKey = ['auth','me'] as const;

   export function useCurrentUser() {
     return useQuery({
       queryKey: authMeKey,
       queryFn: meApi,
       retry: false,
       staleTime: 5 * 60_000,
       gcTime: 30 * 60_000,
     });
   }

   export function useLoginMutation() {
     const qc = useQueryClient();
     return useMutation({
       mutationFn: loginApi,
       onSuccess: (data) => qc.setQueryData(authMeKey, data.user),
     });
   }
   // useRegisterMutation analogicznie
   // useLogoutMutation: onSuccess → qc.setQueryData(authMeKey, null); qc.removeQueries({ queryKey: ['games'] });
   ```
4. `bun run --filter '*' typecheck` → czyste.

**Rezultat:** Klient API + hooki gotowe. Można je użyć w UI.

### Step 2: AuthLayout + ProtectedRoute + reorganizacja routingu
**Pliki:** `apps/client/src/components/layout/auth-layout.tsx`, `apps/client/src/components/auth/protected-route.tsx`, `apps/client/src/main.tsx`

**Co robimy:**
1. `auth-layout.tsx`:
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
2. `protected-route.tsx`:
   ```tsx
   import { Navigate, Outlet, useLocation } from 'react-router-dom';
   import { useCurrentUser } from '@/lib/queries';

   export function ProtectedRoute() {
     const { data: user, isLoading } = useCurrentUser();
     const location = useLocation();
     if (isLoading) {
       return (
         <div className="flex h-screen w-screen items-center justify-center">
           <div className="h-6 w-6 animate-spin rounded-full border-2 border-apex-line-3 border-t-apex-ink" />
         </div>
       );
     }
     if (!user) {
       return <Navigate to="/login" replace state={{ from: location.pathname }} />;
     }
     return <Outlet />;
   }
   ```
3. `main.tsx` — restruktur:
   ```tsx
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
   ```
4. `bun run --filter '*' typecheck` → czyste. Aplikacja startuje (serwer Vite), na `/games` wymaga sesji (redirect na `/login`, który jeszcze pokaże błąd bo `LoginPage` nie istnieje — to OK, fix w step 3).

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
   import { useLoginMutation } from '@/lib/queries';
   import { ApiError } from '@/lib/api';

   export function LoginPage() {
     const navigate = useNavigate();
     const location = useLocation();
     const [email, setEmail] = useState('');
     const [password, setPassword] = useState('');
     const login = useLoginMutation();

     const onSubmit = (e: React.FormEvent) => {
       e.preventDefault();
       login.mutate({ email, password }, {
         onSuccess: () => navigate((location.state as any)?.from ?? '/games', { replace: true }),
       });
     };

     const generalError = login.error instanceof ApiError && login.error.code === 'invalid_credentials'
       ? 'Invalid email or password.'
       : login.isError
       ? 'Something went wrong. Try again.'
       : null;

     return (
       <div>
         <h1 className="text-2xl font-semibold text-apex-ink">Welcome back</h1>
         <p className="mt-2 text-sm text-apex-muted">Sign in to your Apex account.</p>

         {generalError && (
           <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
             {generalError}
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
           <Button type="submit" className="w-full" disabled={login.isPending}>
             {login.isPending ? 'Signing in…' : 'Sign in'}
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
2. `RegisterPage`: analogicznie, dodatkowo:
   - Pole `confirmPassword`, walidacja po kliku submit (jeśli `password !== confirmPassword` → set lokalny error, NIE wywołuj mutation).
   - Min length 8 walidowane przez `<Input minLength={8} />` + check w handlerze (jeśli krótkie → set lokalny error pod polem).
   - Error mapping: `ApiError.code === 'email_taken'` → field error pod email „This email is already registered.". Inny błąd → general banner.
   - Po sukcesie: `navigate('/games', { replace: true })`. (Backend automatycznie ustawia cookie + zwraca user; `useRegisterMutation.onSuccess` wcześniej zaktualizowało `useCurrentUser` cache.)
   - Link „Already have an account? Sign in" → `/login`.
3. Skontroluj: `bun run --filter '*' typecheck`, `bun run lint` czyste. Uruchom `bun run --cwd apps/client dev` + backend `bun run --cwd apps/api dev`. Zweryfikuj ręcznie:
   - `/login` w przeglądarce → split layout, formularz działa
   - Rejestracja od zera → przekierowanie na `/games`, lista gier widoczna (musi być pusta dla nowego usera — Faza 2 nie filtrowała games per user, ale to jest follow-up; w tej iteracji wszyscy widzą wspólne games)
   - Wylogowanie z sidebara → `/login`
   - Próba wejścia na `/games` w nowej karcie bez sesji → redirect na `/login`

**Rezultat:** Strony auth działają end-to-end, po sukcesie user jest w aplikacji.

### Step 4: Sidebar — realny user + Sign out
**Pliki:** `apps/client/src/components/layout/sidebar.tsx`

**Co robimy:**
1. Zastąp hardcoded `Arthur Taylor` / `arthur@apex.com` w dolnej user card użyciem `useCurrentUser`:
   ```tsx
   const { data: user } = useCurrentUser();
   // user gwarantowany niezerowy bo Sidebar renderuje się tylko pod ProtectedRoute, ale dla TS:
   if (!user) return null; // albo skeleton
   const display = user.email.split('@')[0];
   ```
2. Owrap istniejącą user card w `DropdownMenu` (Radix):
   ```tsx
   import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
   import { useLogoutMutation } from '@/lib/queries';
   import { useNavigate } from 'react-router-dom';

   const logout = useLogoutMutation();
   const navigate = useNavigate();
   const onLogout = () => logout.mutate(undefined, {
     onSuccess: () => navigate('/login', { replace: true }),
   });

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
           onSelect={onLogout}
         >
           Sign out
         </DropdownMenu.Item>
       </DropdownMenu.Content>
     </DropdownMenu.Portal>
   </DropdownMenu.Root>
   ```
   (Dokładną składnię Radix v1 weryfikuj z Context7 — Trigger może wymagać `asChild`, Item może mieć różne handlery `onSelect`/`onClick` zależnie od wersji.)
3. Końcowy run:
   - `bun run --filter '*' typecheck`
   - `bun run lint`
   - Manual test: zalogowany user widzi swój email w sidebarze. Klik → menu → Sign out → przekierowanie na `/login`. Otwarcie nowej karty na `/games` → redirect na `/login`.

**Rezultat:** Pełen flow: register → app → logout → login → app. Faza 3 zamknięta.

## If you get stuck
Jeśli po 2 próbach coś nie działa: ZATRZYMAJ się. Napisz:
`STUCK at Step <N>: <co, jaki błąd, jaka hipoteza>`
Zakończ pracę.

Typowe pułapki:
- Cookie nie wysyła się do backendu — sprawdź WSZYSTKIE fetch w `api.ts` mają `credentials: 'include'`. Bez tego nawet same-origin może nie działać w niektórych konfiguracjach Vite proxy.
- Vite dev server na 5173, API na 3001 — to różne origins. Backend MUSI mieć `cors({ origin: 'http://localhost:5173', credentials: true })` (Faza 2 step 3.4). Jeśli używasz Vite proxy (`vite.config.ts` proxy do `/api`) — wszystko jest same-origin i cors w ogóle nie potrzebny. Sprawdź `apps/client/vite.config.ts`. Wybierz JEDNĄ ścieżkę (proxy ALBO cors+credentials) i się jej trzymaj.
- 401 w `useCurrentUser` zwraca `error` zamiast `data: null` — bo `meApi` rzuca na 401. Popraw `meApi`: na `r.status === 401` zwróć `null` zamiast `throw`.
- `useCurrentUser` retry'uje 401 wielokrotnie — sprawdź `retry: false` w `useQuery` config.
- Po loginie dalej `null` w `useCurrentUser` — sprawdź `onSuccess` w `useLoginMutation`: `qc.setQueryData(['auth','me'], data.user)`. Klucz musi być DOKŁADNIE taki sam jak w `useCurrentUser` (stała `authMeKey`).
- ProtectedRoute pokazuje spinner wiecznie — `useCurrentUser` w `isLoading: true` mimo że `meApi` zwróciło `null`. Sprawdź czy promise faktycznie resolvuje się (network tab w devtools, czy `/api/auth/me` zwraca 200/401, nie wisi na 500).
- Radix DropdownMenu nie zamyka się po Sign out przed `navigate` — owinąć `onSelect={(e) => { e.preventDefault(); onLogout(); }}` lub użyć `setTimeout(navigate, 0)`. Zwykle Radix sam zamyka, ale przy szybkim navigate może być flicker.
- Po logout w innej karcie nadal widać `/games` — TanStack Query ma stary cache `['auth','me']`. Rozwiązanie: w `useLogoutMutation.onSuccess` ustaw `null` ORAZ `qc.removeQueries({ queryKey: ['games'] })`. To wyczyści listę gier z innej karty po pierwszym refetchu (lub po manualnym refresh — pełna sync między kartami to tematy na osobny PR, BroadcastChannel API).
- Lint krzyczy o `(location.state as any)` — to akceptowalny escape hatch, ale jeśli biome-config tego zabrania, dodaj typ: `interface FromState { from?: string }` i `const state = location.state as FromState | null;`.
