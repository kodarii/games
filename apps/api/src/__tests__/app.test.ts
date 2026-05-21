import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { Hono } from 'hono';
import { Application } from '../app';
import { sqlite } from '../infrastructure/db/client';
import { requestContext } from '../infrastructure/logging/request-context-middleware';
import { baseLogger } from '../infrastructure/logging/logger';
import { attachProblemJsonErrorHandler } from '../routes/_problem-json';
import { createGamesRouter } from '../routes/games';
import type { AuthVariables } from '../routes/middleware/require-auth';
import { useDisabledIgdbChain } from './_fixtures/igdb-chain-fixture';

useDisabledIgdbChain(Application.buildForTesting().igdbHolderForTesting());

describe('Application lifecycle (BE-07)', () => {
  let exitSpy: ReturnType<typeof spyOn>;
  let serveSpy: ReturnType<typeof spyOn>;
  let events: string[];

  beforeEach(() => {
    events = [];
    spyOn(baseLogger, 'event').mockImplementation((name) => {
      events.push(name);
    });
    spyOn(baseLogger, 'error').mockImplementation((fields) => {
      events.push(`error:${String(fields.event ?? 'unknown')}`);
    });
    exitSpy = spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`__exit_${code ?? 0}`);
    }) as never);
    serveSpy = spyOn(Bun, 'serve').mockImplementation(
      () => ({ stop: async () => undefined }) as ReturnType<typeof Bun.serve>,
    );
    // Prevent the shared sqlite singleton from being closed — closing it would
    // corrupt the DB for all subsequent test files in the same bun test run.
    spyOn(sqlite, 'close').mockImplementation(() => undefined);
  });

  afterEach(() => {
    mock.restore();
  });

  it('start() runs migrations, verifyDb, registers routes, starts scheduler, then listens', async () => {
    const app = new Application();
    await app.start(0);
    expect(events).toContain('startup.migrations.applied');
    expect(events).toContain('api.listening');
    expect(serveSpy).toHaveBeenCalledTimes(1);
  });

  it('second start() logs application.start.duplicate and returns', async () => {
    const app = new Application();
    await app.start(0);
    events.length = 0;
    await app.start(0);
    expect(events).toEqual(['application.start.duplicate']);
    expect(serveSpy).toHaveBeenCalledTimes(1);
  });

  it('stop() stops scheduler, drains server, closes db, exits 0', async () => {
    const app = new Application();
    await app.start(0);
    let exited = -1;
    exitSpy.mockImplementation(((code?: number) => {
      exited = code ?? 0;
      throw new Error('__exit');
    }) as never);
    try {
      await app.stop('SIGTERM', 0);
    } catch (e) {
      // process.exit replaced with throw above
    }
    expect(exited).toBe(0);
    expect(events).toContain('shutdown.start');
    expect(events).toContain('scheduler.stopped');
    expect(events).toContain('shutdown.done');
  });
});

// `apps/api/src` resolved against this file's directory so the fallback scan
// works regardless of which cwd `bun test` is invoked from (root or apps/api).
const API_SRC_ROOT = `${import.meta.dir}/..`;

function isRipgrepAvailable(): boolean {
  try {
    const r = Bun.spawnSync({ cmd: ['rg', '--version'] });
    return r.exitCode === 0;
  } catch (_err) {
    // Bun.spawnSync throws ENOENT when the binary is missing from PATH —
    // treat that as "rg not available" and let the caller fall back.
    return false;
  }
}

interface ScanOpts {
  readonly root: string;
  readonly pattern: RegExp;
  readonly excludeFile: (relPath: string) => boolean;
}

async function scanForPattern(opts: ScanOpts): Promise<string[]> {
  const glob = new Bun.Glob('**/*.ts');
  const hits: string[] = [];
  for await (const rel of glob.scan({ cwd: opts.root })) {
    const fullPath = `${opts.root}/${rel}`;
    if (opts.excludeFile(fullPath)) continue;
    const content = await Bun.file(fullPath).text();
    if (opts.pattern.test(content)) hits.push(fullPath);
  }
  return hits;
}

function makeWiringApp(): Hono<{ Variables: AuthVariables }> {
  const _testApp = Application.buildForTesting();
  const gameOps = _testApp.gameOpsForTesting();
  const httpMw = _testApp.httpMwForTesting();
  const gamesRouter = createGamesRouter({
    create: gameOps.create,
    update: gameOps.update,
    delete: gameOps.delete,
    list: gameOps.list,
    get: gameOps.get,
    moveToCollection: gameOps.moveToCollection,
    igdbChainHolder: _testApp.igdbHolderForTesting(),
    idempotencyKey: httpMw.idempotencyKey,
  });
  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: `wiring-invariant-${crypto.randomUUID()}` } as AuthVariables['user']);
    await next();
  });
  app.route('/api/games', gamesRouter);
  return app;
}

describe('wiring invariants migrated to app.ts (BE-06)', () => {
  it('GET /api/games/metadata/candidates returns 503 with feature-disabled body when chain is null', async () => {
    const app = makeWiringApp();
    const res = await app.request('/api/games/metadata/candidates?title=foo&platform=PC');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { type?: string };
    expect(body.type).toBe('/errors/feature-disabled');
  });

  it('PATCH /api/games/:externalId/metadata returns 503 when chain is null', async () => {
    const app = makeWiringApp();
    const res = await app.request('/api/games/ext-1/metadata', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'x' }),
    });
    expect(res.status).toBe(503);
  });

  it('no rogue `new DrizzleX()` outside app.ts (composition-root invariant)', async () => {
    // Prefer ripgrep (`rg`) when available — it's the idiomatic codebase grep
    // tool and gives the clearest signal locally. Fall back to a Bun.Glob walk
    // when `rg` is missing (e.g. some CI sandboxes) — same architectural
    // invariant, no external dep.
    const rgAvailable = isRipgrepAvailable();
    if (rgAvailable) {
      const r = Bun.spawnSync({
        cmd: [
          'rg',
          '-l',
          '--type=ts',
          'new (DrizzleGameRepository|DrizzleTransactionRunner|IgdbChainHolder)\\(',
          API_SRC_ROOT,
          '--glob=!**/app.ts',
          '--glob=!**/__tests__/**',
          '--glob=!**/*.test.ts',
        ],
      });
      const hits = r.stdout.toString().trim();
      expect(hits).toBe('');
      return;
    }
    const hits = await scanForPattern({
      root: API_SRC_ROOT,
      pattern: /new (DrizzleGameRepository|DrizzleTransactionRunner|IgdbChainHolder)\(/,
      excludeFile: (path) =>
        path.endsWith('/app.ts') || path.includes('/__tests__/') || path.endsWith('.test.ts'),
    });
    expect(hits).toEqual([]);
  });

  it('no rogue chain-holder swap() invocation outside _fixtures/ and app.ts (Q5 fixture-mediated isolation invariant)', async () => {
    // Q5: production code MUST use swap() through composition root (app.ts).
    // Test code MUST use swap() through shared fixture (_fixtures/igdb-chain-fixture.ts).
    // Ad-hoc swap() in random files breaks identity-preserving restore and
    // poisons `bun test --randomize` runs.
    const rgAvailable = isRipgrepAvailable();
    if (rgAvailable) {
      const r = Bun.spawnSync({
        cmd: [
          'rg',
          '-l',
          '--type=ts',
          'igdbChainHolder\\.swap\\(',
          API_SRC_ROOT,
          '--glob=!**/_fixtures/**',
          '--glob=!**/app.ts',
        ],
      });
      const hits = r.stdout.toString().trim();
      expect(hits).toBe('');
      return;
    }
    const hits = await scanForPattern({
      root: API_SRC_ROOT,
      pattern: /igdbChainHolder\.swap\(/,
      excludeFile: (path) => path.includes('/_fixtures/') || path.endsWith('/app.ts'),
    });
    expect(hits).toEqual([]);
  });
});
