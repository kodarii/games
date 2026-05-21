import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { requestContext } from '../infrastructure/logging/request-context-middleware';
import { attachProblemJsonErrorHandler } from '../routes/_problem-json';
import { createGamesRouter } from '../routes/games';
import type { AuthVariables } from '../routes/middleware/require-auth';
import {
  createGame,
  updateGame,
  deleteGame,
  listGames,
  getGame,
  moveToCollection,
  igdbChainHolder,
  idempotencyKeyMiddleware,
} from '../wiring';
import { useDisabledIgdbChain } from './_fixtures/igdb-chain-fixture';

const gamesRouter = createGamesRouter({
  create: createGame,
  update: updateGame,
  delete: deleteGame,
  list: listGames,
  get: getGame,
  moveToCollection,
  igdbChainHolder,
  idempotencyKey: idempotencyKeyMiddleware,
});

useDisabledIgdbChain();

const TEST_USER_ID = `test-wiring-${crypto.randomUUID()}`;

function makeApp() {
  const app = new Hono<{ Variables: AuthVariables }>();
  attachProblemJsonErrorHandler(app);
  app.use('*', requestContext());
  app.use('/api/games/*', async (c, next) => {
    c.set('user', { id: TEST_USER_ID } as AuthVariables['user']);
    await next();
  });
  app.route('/api/games', gamesRouter);
  return app;
}

const app = makeApp();

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

describe('wiring smoke (BE-06)', () => {
  it('GET /api/games/metadata/candidates returns 503 with feature-disabled body when chain is null', async () => {
    expect(igdbChainHolder.isConfigured()).toBe(false);
    const res = await app.request('/api/games/metadata/candidates?title=foo&platform=PC');
    expect(res.status).toBe(503);
    const body = (await res.json()) as { type?: string };
    expect(body.type).toBe('/errors/feature-disabled');
  });

  it('PATCH /api/games/:externalId/metadata returns 503 when chain is null', async () => {
    const res = await app.request('/api/games/ext-1/metadata', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId: 'x' }),
    });
    expect(res.status).toBe(503);
  });

  it('no rogue `new DrizzleX()` outside wiring.ts (composition-root invariant)', async () => {
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
          '--glob=!**/wiring.ts',
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
        path.endsWith('/wiring.ts') || path.includes('/__tests__/') || path.endsWith('.test.ts'),
    });
    expect(hits).toEqual([]);
  });

  it('no rogue chain-holder swap() invocation outside _fixtures/ and wiring.ts (Q5 fixture-mediated isolation invariant)', async () => {
    // Q5: production code MUST use swap() through composition root (wiring.ts).
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
          '--glob=!**/wiring.ts',
        ],
      });
      const hits = r.stdout.toString().trim();
      expect(hits).toBe('');
      return;
    }
    const hits = await scanForPattern({
      root: API_SRC_ROOT,
      pattern: /igdbChainHolder\.swap\(/,
      excludeFile: (path) => path.includes('/_fixtures/') || path.endsWith('/wiring.ts'),
    });
    expect(hits).toEqual([]);
  });
});
