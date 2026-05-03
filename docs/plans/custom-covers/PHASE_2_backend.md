# Custom Covers — Faza 2: Backend

## Goal
Dodaj na backendzie:
1. **Globalny** klient UploadThing (token z ENV) za portem `CoverStorage`
2. **Email allowlist** z ENV — tylko whitelisted userzy mogą uploadować
3. `GET /api/me/permissions` — frontend pyta czy może uploadować
4. `POST /api/upload/cover` — multipart upload z walidacją (5 MB, JPEG/PNG/WebP)
5. Rozszerz `PUT /api/games/:id` i `POST /api/games` o pole `coverImage`
6. **Inline cleanup**: `UpdateGame` i `DeleteGame` kasują stary plik z UT po sukcesie zapisu (fire-and-forget)
7. **Cron 24h** — sprzątanie orphanów (pliki w UT >24h których URL nie istnieje w DB)

**UWAGA:** wcześniejsza wersja planu zakładała per-user UploadThing token w tabeli `userSettings` + endpointy `GET/POST /api/settings`. **TO ZNIKA.** Token jest globalny w ENV. Endpoint `/api/settings` NIE powstaje.

## Definition of Done
- [ ] `GET /api/me/permissions` → `{ canUploadCovers: boolean }` (zalogowany user)
- [ ] `POST /api/upload/cover` z multipart `file` → `{ url: string }` (user w allowliście, plik ≤5 MB, JPEG/PNG/WebP)
- [ ] `POST /api/upload/cover` → 403 gdy user nie w allowliście
- [ ] `POST /api/upload/cover` → 400 `invalid_file` gdy zły MIME/rozmiar
- [ ] `POST /api/upload/cover` → 502 `upload_failed` gdy UT padło
- [ ] `PUT /api/games/:id` akceptuje `coverImage: string | null`
- [ ] Po edycji gry zmieniającej cover, stary URL skasowany z UT (fire-and-forget)
- [ ] Po usunięciu gry z coverem, URL skasowany z UT (fire-and-forget)
- [ ] Cron startuje przy `bun run dev` i loguje wynik na end każdego cyklu
- [ ] `cd apps/api && bun run check && bun test` — wszystko zielone
- [ ] Nowe testy: `update-game` weryfikuje delete na CoverStorage; `delete-game` weryfikuje delete; `cleanup-orphans.test.ts` pokrywa diff i bezpieczny próg 24h

Agent kończy pracę WYŁĄCZNIE gdy powyższe są spełnione.

## Context
**Runtime:** Bun (NIE Node.js, NIE npm)
**Wcześniejsza faza:** `coverImage` już w domain + DB + repo (Faza 1)
**Auth:** każdy nowy route używa `requireAuth` (wzorzec w `apps/api/src/index.ts`)
**Pakiet UploadThing:** `uploadthing` (NIE `@uploadthing/react`)

## Design decisions
- **Token globalny** z `process.env.UPLOADTHING_TOKEN` — jeden na całą apkę
- **Allowlist po emailu** w `process.env.UPLOAD_ALLOWED_EMAILS` (CSV) — chroni darmowy tier UT
- Port `CoverStorage` w **application layer** (nie domain) — to nie jest pojęcie domenowe
- Adapter `UploadThingCoverStorage` w infrastructure
- Cleanup w `UpdateGame`/`DeleteGame` jest **fire-and-forget** — failure delete nie blokuje response, orphan łapie cron
- Cron: `setInterval` w `index.ts`, co 24h, kasuje pliki UT **starsze niż 24h** (race-safe)
- Walidacja pliku w route'cie ZANIM poleci do UT (oszczędność transferu)
- 403 a nie 422 dla braku allowlist (RFC 7231 — forbidden, semantycznie poprawne)

---

## Relevant files

### Utwórz nowe:
- `apps/api/src/application/cover-storage/cover-storage.ts` — port (interface)
- `apps/api/src/application/cover-storage/cleanup-orphans.ts` — use case dla crona
- `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts` — adapter
- `apps/api/src/infrastructure/cover-storage/upload-allowlist.ts` — parser ENV + check
- `apps/api/src/routes/upload.ts`
- `apps/api/src/routes/me.ts`
- `apps/api/src/routes/middleware/require-upload-permission.ts`
- `apps/api/src/application/games/__tests__/cleanup-orphans.test.ts` (lub w `application/cover-storage/`)

### Edytuj:
- `apps/api/src/application/games/update-game.ts` — wstrzyknij `CoverStorage`, dodaj cleanup, dodaj `coverImage` do Zod
- `apps/api/src/application/games/create-game.ts` — dodaj `coverImage` do Zod
- `apps/api/src/application/games/delete-game.ts` — wstrzyknij `CoverStorage`, dodaj cleanup
- `apps/api/src/application/games/update-game.test.ts` — fake CoverStorage + test replace/remove
- `apps/api/src/application/games/delete-game.test.ts` — fake CoverStorage + test
- `apps/api/src/application/games/create-game.test.ts` — naprawić jeśli sygnatura się rozjeżdża
- `apps/api/src/routes/games.ts` — wstrzyknij `coverStorage` do use case'ów
- `apps/api/src/index.ts` — mount nowych routes + start cron + cleanup przy SIGTERM
- `apps/api/.env` (lub `.env.example`) — dodać `UPLOADTHING_TOKEN`, `UPLOAD_ALLOWED_EMAILS`

### Czytaj ale NIE edytuj:
- `apps/api/src/routes/middleware/require-auth.ts` — wzorzec middleware
- `apps/api/src/routes/games.ts` — wzorzec route handler (przed edycją)
- `apps/api/src/domain/games/game.ts` — `coverImage` getter (z Fazy 1)
- `apps/api/src/domain/games/game-repository.ts` — `findAllCoverImages` (z Fazy 1)

---

## Steps

### Step 0: Zainstaluj zależność i przeczytaj docs

```bash
cd apps/api && bun add uploadthing
```

Następnie użyj **Context7 MCP** żeby pobrać aktualne API:
- Library: `uploadthing`
- Query: "UTApi server-side uploadFiles deleteFiles listFiles with token"

Kluczowe API (potwierdź w docs że nadal aktualne):
```ts
import { UTApi } from 'uploadthing/server';
const utapi = new UTApi({ token: 'sk_...' });

// upload (zwraca url + key)
const r = await utapi.uploadFiles(file); // file: File
// r.data?.url, r.data?.key

// delete (po kluczu — NIE po URL)
await utapi.deleteFiles([fileKey]);

// list (paginowane)
const list = await utapi.listFiles({ limit: 500 });
// list.files[].key, list.files[].uploadedAt (epoch ms)
```

URL plików ma postać `https://utfs.io/f/<key>` lub `https://<id>.ufs.sh/f/<key>` — `key` to ostatni segment ścieżki.

---

### Step 1: ENV + allowlist parser

**1a) Plik:** `apps/api/.env.example` (i twój `.env`)

Dodaj:
```env
UPLOADTHING_TOKEN=
UPLOAD_ALLOWED_EMAILS=
```

Wpisz prawdziwy token i swój email do `.env` (nie commituj).

**1b) Plik:** `apps/api/src/infrastructure/cover-storage/upload-allowlist.ts`

```ts
const allowed = (process.env.UPLOAD_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isUploadAllowed(email: string | undefined | null): boolean {
  if (!email) return false;
  return allowed.includes(email.toLowerCase());
}
```

---

### Step 2: Port `CoverStorage`

**Plik:** `apps/api/src/application/cover-storage/cover-storage.ts`

```ts
export interface CoverStorage {
  /** Upload file. Returns public URL. */
  upload(file: File): Promise<{ url: string }>;
  /** Delete by URL. Idempotent — never throws on missing. */
  delete(url: string): Promise<void>;
  /** List URLs of files older than `olderThanHours` hours. Used by orphan cron. */
  listOlderThan(olderThanHours: number): Promise<string[]>;
}
```

---

### Step 3: Adapter `UploadThingCoverStorage`

**Plik:** `apps/api/src/infrastructure/cover-storage/uploadthing-cover-storage.ts`

```ts
import { UTApi } from 'uploadthing/server';
import type { CoverStorage } from '../../application/cover-storage/cover-storage';

function urlToKey(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    return segs[segs.length - 1] ?? null;
  } catch {
    return null;
  }
}

export class UploadThingCoverStorage implements CoverStorage {
  private utapi: UTApi;
  private baseUrl = 'https://utfs.io/f/';

  constructor(token: string) {
    if (!token) {
      throw new Error('UploadThingCoverStorage: token is required');
    }
    this.utapi = new UTApi({ token });
  }

  async upload(file: File): Promise<{ url: string }> {
    const r = await this.utapi.uploadFiles(file);
    if (r.error || !r.data?.url) {
      throw new Error(`uploadthing upload failed: ${r.error?.message ?? 'no url'}`);
    }
    return { url: r.data.url };
  }

  async delete(url: string): Promise<void> {
    const key = urlToKey(url);
    if (!key) return;
    try {
      await this.utapi.deleteFiles([key]);
    } catch (err) {
      console.warn('[cover-storage] delete failed', { url, err });
    }
  }

  async listOlderThan(olderThanHours: number): Promise<string[]> {
    const cutoff = Date.now() - olderThanHours * 3600 * 1000;
    const all: string[] = [];
    // listFiles paginates; loop until exhausted (UT default limit is 500)
    let offset = 0;
    while (true) {
      const r = await this.utapi.listFiles({ limit: 500, offset });
      if (!r.files || r.files.length === 0) break;
      for (const f of r.files) {
        const uploadedAt = typeof f.uploadedAt === 'number' ? f.uploadedAt : 0;
        if (uploadedAt < cutoff && f.key) {
          all.push(`${this.baseUrl}${f.key}`);
        }
      }
      if (r.files.length < 500) break;
      offset += 500;
    }
    return all;
  }
}
```

**Uwaga:** Pole `f.uploadedAt` i sygnatura `listFiles` mogą się różnić w aktualnej wersji `uploadthing` — **potwierdź przez Context7** i dostosuj. Jeśli `listFiles` nie zwraca `uploadedAt`, alternatywnie użyj `getUsageInfo` lub trzymaj timestamp w nazwie/customId pliku przy uploadzie.

---

### Step 4: Cleanup-orphans use case

**Plik:** `apps/api/src/application/cover-storage/cleanup-orphans.ts`

```ts
import type { GameRepository } from '../../domain/games/game-repository';
import type { CoverStorage } from './cover-storage';

export class CleanupOrphans {
  constructor(
    private readonly storage: CoverStorage,
    private readonly gameRepo: GameRepository,
  ) {}

  /**
   * Returns counts: { listed, inDb, orphans, deleted, failed }.
   * Safe to run at any cadence — only deletes files older than 24h.
   */
  async run(): Promise<{
    listed: number;
    inDb: number;
    orphans: number;
    deleted: number;
    failed: number;
  }> {
    const [oldUrls, dbUrls] = await Promise.all([
      this.storage.listOlderThan(24),
      this.gameRepo.findAllCoverImages(),
    ]);
    const dbSet = new Set(dbUrls);
    const orphans = oldUrls.filter((u) => !dbSet.has(u));

    let deleted = 0;
    let failed = 0;
    for (const url of orphans) {
      try {
        await this.storage.delete(url);
        deleted++;
      } catch {
        failed++;
      }
    }

    return {
      listed: oldUrls.length,
      inDb: dbUrls.length,
      orphans: orphans.length,
      deleted,
      failed,
    };
  }
}
```

---

### Step 5: Wire `CoverStorage` do `UpdateGame`

**Plik:** `apps/api/src/application/games/update-game.ts`

1. Import:
   ```ts
   import type { CoverStorage } from '../cover-storage/cover-storage';
   ```

2. Do Zod schema dodaj pole:
   ```ts
   coverImage: z.string().url().nullable().optional(),
   ```

3. Constructor:
   ```ts
   constructor(
     private readonly repo: GameRepository,
     private readonly platformRepo: PlatformRepository,
     private readonly coverStorage: CoverStorage,
   ) {}
   ```

4. Do `props: GameProps` dodaj:
   ```ts
   coverImage: data.coverImage ?? undefined,
   ```

5. Po `const updated = await this.repo.update(...)` (i przed `return ok(updated)`) dodaj cleanup:
   ```ts
   const oldUrl = existing.coverImage;
   const newUrl = updated.coverImage;
   if (oldUrl && oldUrl !== newUrl) {
     void this.coverStorage.delete(oldUrl).catch((err) => {
       console.warn('[update-game] cover cleanup failed', { id, oldUrl, err });
     });
   }
   ```

---

### Step 6: Wire `CoverStorage` do `DeleteGame`

**Plik:** `apps/api/src/application/games/delete-game.ts`

```ts
import type { Game } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import type { CoverStorage } from '../cover-storage/cover-storage';

export type DeleteGameError = { kind: 'not_found' };

export class DeleteGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly coverStorage: CoverStorage,
  ) {}

  async execute(id: number, userId: string): Promise<Result<Game, DeleteGameError>> {
    const existing = await this.repo.findById(id);
    if (!existing || existing.userId !== userId) {
      return err({ kind: 'not_found' });
    }

    const deleted = await this.repo.delete(id);
    if (!deleted) {
      return err({ kind: 'not_found' });
    }

    if (existing.coverImage) {
      void this.coverStorage.delete(existing.coverImage).catch((err) => {
        console.warn('[delete-game] cover cleanup failed', { id, url: existing.coverImage, err });
      });
    }

    return ok(deleted);
  }
}
```

---

### Step 7: Update `CreateGame` Zod

**Plik:** `apps/api/src/application/games/create-game.ts`

1. Do Zod schema dodaj:
   ```ts
   coverImage: z.string().url().nullable().optional(),
   ```

2. Do `props: GameProps` dodaj:
   ```ts
   coverImage: data.coverImage ?? undefined,
   ```

(Create nie potrzebuje cleanup — nie ma czego kasować.)

---

### Step 8: Middleware `requireUploadPermission`

**Plik:** `apps/api/src/routes/middleware/require-upload-permission.ts`

```ts
import type { MiddlewareHandler } from 'hono';
import { isUploadAllowed } from '../../infrastructure/cover-storage/upload-allowlist';
import type { AuthVariables } from './require-auth';

export const requireUploadPermission: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const email = c.get('user').email;
  if (!isUploadAllowed(email)) {
    return c.json({ error: 'forbidden' }, 403);
  }
  await next();
};
```

---

### Step 9: Route `GET /api/me/permissions`

**Plik:** `apps/api/src/routes/me.ts`

```ts
import { Hono } from 'hono';
import { isUploadAllowed } from '../infrastructure/cover-storage/upload-allowlist';
import type { AuthVariables } from './middleware/require-auth';

export const me = new Hono<{ Variables: AuthVariables }>();

me.get('/permissions', (c) => {
  const email = c.get('user').email;
  return c.json({ canUploadCovers: isUploadAllowed(email) });
});
```

---

### Step 10: Route `POST /api/upload/cover`

**Plik:** `apps/api/src/routes/upload.ts`

```ts
import { Hono } from 'hono';
import type { CoverStorage } from '../application/cover-storage/cover-storage';
import type { AuthVariables } from './middleware/require-auth';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function createUploadRoute(storage: CoverStorage) {
  const route = new Hono<{ Variables: AuthVariables }>();

  route.post('/cover', async (c) => {
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: 'invalid_file' }, 400);
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return c.json({ error: 'invalid_file' }, 400);
    }
    if (file.size > MAX_BYTES) {
      return c.json({ error: 'invalid_file' }, 400);
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return c.json({ error: 'invalid_file' }, 400);
    }

    try {
      const { url } = await storage.upload(file);
      return c.json({ url });
    } catch (err) {
      console.error('[upload] failed', err);
      return c.json({ error: 'upload_failed' }, 502);
    }
  });

  return route;
}
```

(Eksportujemy factory bo route potrzebuje `storage` z DI — symetrycznie do tego jak `index.ts` montuje route'y.)

---

### Step 11: Wire all w `routes/games.ts` (CoverStorage do use case'ów)

**Plik:** `apps/api/src/routes/games.ts`

Na górze, zamiast bezpośredniego `new UpdateGame(repo, platformRepo)` itd., factory potrzebuje `coverStorage`. Zmień:

```ts
import { UploadThingCoverStorage } from '../infrastructure/cover-storage/uploadthing-cover-storage';

const repo = new DrizzleGameRepository();
const platformRepo = new DrizzlePlatformRepository();
const coverStorage = new UploadThingCoverStorage(process.env.UPLOADTHING_TOKEN ?? '');

const createGame = new CreateGame(repo, platformRepo);
const deleteGame = new DeleteGame(repo, coverStorage);
const listGames = new ListGames(repo);
const getGame = new GetGame(repo);
const updateGame = new UpdateGame(repo, platformRepo, coverStorage);
```

**Uwaga:** Jeśli `UPLOADTHING_TOKEN` nie ustawiony, konstruktor rzuci. Akceptujemy to — apka NIE startuje bez tokena (fail-fast).

Eksportuj `coverStorage` żeby `index.ts` mógł go użyć dla crona i upload route. Najprościej:

```ts
export const sharedCoverStorage = coverStorage;
```

Albo lepiej — wyodrębnij wiring do `apps/api/src/wiring.ts`:

```ts
// apps/api/src/wiring.ts
import { UploadThingCoverStorage } from './infrastructure/cover-storage/uploadthing-cover-storage';
import { DrizzleGameRepository } from './infrastructure/games/drizzle-game-repository';

export const coverStorage = new UploadThingCoverStorage(process.env.UPLOADTHING_TOKEN ?? '');
export const gameRepository = new DrizzleGameRepository();
```

I `routes/games.ts` + `index.ts` importują z `wiring.ts`.

---

### Step 12: Cron — `setInterval` w `index.ts`

**Plik:** `apps/api/src/index.ts`

Dodaj importy:
```ts
import { CleanupOrphans } from './application/cover-storage/cleanup-orphans';
import { coverStorage, gameRepository } from './wiring';
import { createUploadRoute } from './routes/upload';
import { me } from './routes/me';
import { requireUploadPermission } from './routes/middleware/require-upload-permission';
```

Po istniejących mountach (`/api/import` itd.) dodaj:

```ts
// /api/me — auth required, no allowlist
app.use('/api/me/*', requireAuth);
app.route('/api/me', me);

// /api/upload — auth + allowlist required
app.use('/api/upload/*', requireAuth);
app.use('/api/upload/*', requireUploadPermission);
app.route('/api/upload', createUploadRoute(coverStorage));
```

Po `console.log(...)` dodaj cron:

```ts
const cleanup = new CleanupOrphans(coverStorage, gameRepository);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const cleanupTimer = setInterval(async () => {
  try {
    const result = await cleanup.run();
    console.log('[cleanup-orphans]', result);
  } catch (err) {
    console.error('[cleanup-orphans] failed', err);
  }
}, ONE_DAY_MS);

// Graceful shutdown — clear timer
const shutdown = () => {
  clearInterval(cleanupTimer);
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

**NIE** odpalamy cleanup od razu przy boot — odczekamy 24h. (Jeśli chcesz testować szybciej, ręcznie wywołaj endpoint albo zmniejsz `ONE_DAY_MS` lokalnie — ale NIE commituj zmiany.)

---

### Step 13: Aktualizuj `routes/games.ts` żeby używał wiring

Zamień bezpośrednie `new DrizzleGameRepository()` na import z `wiring.ts`. Reszta route'a bez zmian — już używa `updateGame.execute` i `deleteGame.execute`, które teraz mają cleanup pod spodem.

---

### Step 14: Testy

**14a) `update-game.test.ts`**

Dodaj `FakeCoverStorage`:
```ts
class FakeCoverStorage implements CoverStorage {
  deleted: string[] = [];
  upload = async () => ({ url: 'https://fake/uploaded' });
  delete = async (url: string) => { this.deleted.push(url); };
  listOlderThan = async () => [];
}
```

Dostosuj `useCase = new UpdateGame(repo, platformRepo, coverStorage)` w `beforeEach` (tworzona instancja `FakeCoverStorage`).

Dodaj `findAllCoverImages` do `FakeGameRepository` (jeśli jeszcze brak po Fazie 1):
```ts
findAllCoverImages = async () => [];
```

Nowe testy:
```ts
it('deletes old cover from storage when coverImage changes', async () => {
  const seeded = Game.fromPersistence({
    ...existingGameRow, coverImage: 'https://utfs.io/f/old-key',
  });
  repo.seed(seeded);

  await useCase.execute(1, { ...validInput, coverImage: 'https://utfs.io/f/new-key' }, 'user-A');

  // fire-and-forget — give microtask queue a tick
  await Promise.resolve();
  expect(coverStorage.deleted).toEqual(['https://utfs.io/f/old-key']);
});

it('does not delete when coverImage unchanged', async () => {
  const seeded = Game.fromPersistence({
    ...existingGameRow, coverImage: 'https://utfs.io/f/same',
  });
  repo.seed(seeded);

  await useCase.execute(1, { ...validInput, coverImage: 'https://utfs.io/f/same' }, 'user-A');
  await Promise.resolve();
  expect(coverStorage.deleted).toEqual([]);
});

it('deletes old cover when user clears coverImage (sets null)', async () => {
  const seeded = Game.fromPersistence({
    ...existingGameRow, coverImage: 'https://utfs.io/f/will-go',
  });
  repo.seed(seeded);

  await useCase.execute(1, { ...validInput, coverImage: null }, 'user-A');
  await Promise.resolve();
  expect(coverStorage.deleted).toEqual(['https://utfs.io/f/will-go']);
});
```

**Uwaga:** `existingGameRow` musi zawierać `coverImage` field — rozszerz testowy fixture.

**14b) `delete-game.test.ts`**

Analogicznie — `FakeCoverStorage`, test:
```ts
it('deletes cover from storage when game with cover is deleted', async () => {
  // seed game with coverImage
  await useCase.execute(1, 'user-A');
  await Promise.resolve();
  expect(coverStorage.deleted).toEqual(['https://utfs.io/f/some-key']);
});

it('does not call storage when game has no cover', async () => {
  // seed game without coverImage
  await useCase.execute(1, 'user-A');
  await Promise.resolve();
  expect(coverStorage.deleted).toEqual([]);
});
```

**14c) `cleanup-orphans.test.ts`**

Nowy plik. Test:
```ts
import { describe, it, expect } from 'bun:test';
import { CleanupOrphans } from './cleanup-orphans';

class FakeStorage {
  files: string[];
  deleted: string[] = [];
  constructor(files: string[]) { this.files = files; }
  upload = async () => ({ url: '' });
  delete = async (u: string) => { this.deleted.push(u); };
  listOlderThan = async () => this.files;
}

class FakeRepo {
  constructor(public urls: string[]) {}
  findAllCoverImages = async () => this.urls;
  // stuby reszty interfejsu — minimum żeby kompilowało
  list = async () => ({ items: [], total: 0 });
  listAll = async () => [];
  findById = async () => null;
  findByExternalId = async () => null;
  create = async () => { throw new Error('unused'); };
  update = async () => null;
  delete = async () => null;
  countByPlatform = async () => 0;
}

describe('CleanupOrphans', () => {
  it('deletes only files not present in DB', async () => {
    const storage = new FakeStorage(['url-A', 'url-B', 'url-C']);
    const repo = new FakeRepo(['url-A']);
    const cleanup = new CleanupOrphans(storage as any, repo as any);

    const r = await cleanup.run();

    expect(storage.deleted.sort()).toEqual(['url-B', 'url-C']);
    expect(r).toEqual({ listed: 3, inDb: 1, orphans: 2, deleted: 2, failed: 0 });
  });

  it('does nothing when all files have DB references', async () => {
    const storage = new FakeStorage(['url-A']);
    const repo = new FakeRepo(['url-A']);
    const cleanup = new CleanupOrphans(storage as any, repo as any);

    const r = await cleanup.run();

    expect(storage.deleted).toEqual([]);
    expect(r.deleted).toBe(0);
  });
});
```

**14d) `create-game.test.ts`**

Najprawdopodobniej tylko musi dodać `findAllCoverImages: async () => []` do `FakeGameRepository`. Nie potrzeba `FakeCoverStorage` (CreateGame go nie ma).

---

### Step 15: Final check

```bash
cd apps/api && bun run check && bun test && bun run lint
```

Wszystko zielone → faza zakończona.

---

## API spec

```
GET /api/me/permissions
  → 200: { canUploadCovers: boolean }
  → 401: { error: "unauthorized" }

POST /api/upload/cover
  Headers: Cookie (session)
  Body: multipart/form-data, field "file" (image/jpeg | image/png | image/webp, ≤5 MB)
  → 200: { url: string }
  → 400: { error: "invalid_file" }   // bad MIME, oversize, no file
  → 401: { error: "unauthorized" }
  → 403: { error: "forbidden" }       // not in allowlist
  → 502: { error: "upload_failed" }   // UT down / network

PUT /api/games/:id
  Body: { ..., coverImage?: string | null }
  → 200: Game (with coverImage: string | null)

POST /api/games
  Body: { ..., coverImage?: string | null }
  → 201: Game

DELETE /api/games/:id
  → 200: Game  (cover async-deleted from UT)
```

---

## If you get stuck

Jeśli po 2 próbach coś nie działa, ZATRZYMAJ się i napisz:
```
STUCK at Step <N>: <co konkretnie, jaki błąd, hipoteza>
```

Najczęstsze pułapki:
- `UTApi.listFiles` API się zmieniło — sprawdź Context7, dostosuj `listOlderThan`
- `f.uploadedAt` nie istnieje w response → patrz uwaga w Step 3
- Hono FormData parsing failuje → upewnij się że nie ma `Content-Type: application/json` na route'cie
- `process.env.UPLOADTHING_TOKEN` undefined → sprawdź `.env` i czy Bun ładuje je automatycznie (Bun robi to z `.env` w cwd)

Zakończ pracę i poczekaj na pomoc.
