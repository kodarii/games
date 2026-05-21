import type { ImportMode, ImportReport } from '@apex/shared';
import type { GameRepository } from '../../domain/games/game-repository';
import { NewGame } from '../../domain/games/new-game';
import type { ImportPlan, ImportRepository } from '../../domain/import/import-repository';
import { NewPlatform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { type Result, err, ok } from '../../domain/shared/result';
import { type ImportParseError, parseImport } from './parse-import';

export type ImportError =
  | ImportParseError
  | {
      kind: 'duplicate_external_id';
      scope: 'platforms' | 'games';
      externalId: string;
      indices: number[];
    }
  | { kind: 'duplicate_platform_name'; name: string; indices: number[] }
  | { kind: 'unknown_platform'; platform: string; gameIndices: number[] }
  | { kind: 'domain_error'; scope: 'platforms' | 'games'; index: number; error: unknown };

export class ImportData {
  constructor(
    private readonly gameRepo: GameRepository,
    private readonly platformRepo: PlatformRepository,
    private readonly importRepo: ImportRepository,
    private readonly idGenerator: () => string = () => crypto.randomUUID(),
  ) {}

  async execute(
    userId: string,
    rawJson: string,
    mode: ImportMode,
  ): Promise<Result<ImportReport, ImportError>> {
    const parsed = parseImport(rawJson, this.idGenerator);
    if (!parsed.ok) return err(parsed.error);
    const snap = parsed.value;

    const dupP = findFirstDuplicate(snap.platforms.map((p) => p.externalId));
    if (dupP)
      return err({
        kind: 'duplicate_external_id',
        scope: 'platforms',
        externalId: dupP.value,
        indices: dupP.indices,
      });

    const dupG = findFirstDuplicate(snap.games.map((g) => g.externalId));
    if (dupG)
      return err({
        kind: 'duplicate_external_id',
        scope: 'games',
        externalId: dupG.value,
        indices: dupG.indices,
      });

    const dupName = findFirstDuplicate(snap.platforms.map((p) => p.name));
    if (dupName)
      return err({
        kind: 'duplicate_platform_name',
        name: dupName.value,
        indices: dupName.indices,
      });

    const platformsInFile = new Set(snap.platforms.map((p) => p.name));
    const userPlatforms = mode === 'merge' ? await this.platformRepo.list(userId) : [];
    const platformsInUser = new Set(userPlatforms.map((p) => p.name));

    if (mode === 'merge') {
      const userByName = new Map(userPlatforms.map((p) => [p.name, p.externalId]));
      snap.platforms = snap.platforms.map((p) => {
        const existing = userByName.get(p.name);
        return existing && existing !== p.externalId ? { ...p, externalId: existing } : p;
      });
    }

    const unknownByPlatform = new Map<string, number[]>();
    snap.games.forEach((g, i) => {
      if (!platformsInFile.has(g.platform) && !platformsInUser.has(g.platform)) {
        const arr = unknownByPlatform.get(g.platform) ?? [];
        arr.push(i);
        unknownByPlatform.set(g.platform, arr);
      }
    });
    const firstUnknown = unknownByPlatform.entries().next();
    if (!firstUnknown.done) {
      const [platform, gameIndices] = firstUnknown.value;
      return err({ kind: 'unknown_platform', platform, gameIndices });
    }

    const newPlatforms: NewPlatform[] = [];
    for (const [i, p] of snap.platforms.entries()) {
      const r = NewPlatform.create({ userId, name: p.name }, () => p.externalId);
      if (!r.ok) return err({ kind: 'domain_error', scope: 'platforms', index: i, error: r.error });
      newPlatforms.push(r.value);
    }

    const newGames: NewGame[] = [];
    /**
     * FIXME(BE-02c, F-08-1): Production-path silent drop of `coverImage` +
     * `metadataRef`.
     *
     * `NewGame.create` accepts `coverImage` and `metadataRef` props (see
     * apps/api/src/domain/games/new-game.ts NewGameProps), and
     * `DrizzleImportRepository.applyMerge`/`applyReplace` were extended in
     * Phase 5 (BE-02b, plan 05-08) to persist these fields at the repo
     * boundary when supplied. However, the v4 snapshot schema does not
     * declare them (packages/shared/src/import-schema-v4.ts) and
     * `export-snapshot.ts` does not emit them. So `g.coverImage` and
     * `g.metadataRef` are structurally `undefined` per the v4 schema at
     * this call site, and the repo-layer fix is dead code on this path.
     *
     * v5 unblocking work (out of Phase 5):
     *   1. Bump snapshot schema to `ExportSnapshotV5` with `coverImage`,
     *      `metadataProvider`, `metadataProviderId`, `metadataMatchedAt`.
     *      Keep v4 readable (additive).
     *   2. Extend `toSnapshot` in export-snapshot.ts to emit those fields.
     *   3. Add `coverImage: g.coverImage ?? null` and
     *      `metadataRef: g.metadataRef ?? null` to the `NewGame.create`
     *      call below.
     *   4. Flip `round-trip.test.ts` Test 1's `not.toHaveProperty`
     *      assertions to positive preservation assertions.
     *   5. Update `.planning/codebase/CONCERNS.md` BE-02c entry to
     *      "Resolved" and the 05-CONTEXT.md D-33 line to reflect the
     *      lifted scope.
     *
     * The round-trip test in
     * `apps/api/src/infrastructure/import/__tests__/round-trip.test.ts`
     * carries `not.toHaveProperty('coverImage')` etc., which surfaces a
     * discoverable RED signal that the v5 PR cannot quietly skip via
     * export-side change alone — ImportData.execute must also be extended
     * (this site).
     *
     * Discovery: `grep -r 'FIXME(BE-02c' apps/api/src` returns 4 hits
     * (this block + the inline marker below, plus 2 in export-snapshot.ts).
     */
    for (const [i, g] of snap.games.entries()) {
      const isWishlist = g.kind === 'wishlist';
      // FIXME(BE-02c, F-08-1): coverImage + metadataRef not plumbed — v4 schema does not carry them. See block comment above.
      const r = NewGame.create(
        {
          kind: g.kind,
          userId,
          title: g.title,
          developer: g.developer,
          genre: g.genre,
          releaseYear: g.releaseYear ?? undefined,
          platform: g.platform,
          hoursPlayed: isWishlist ? null : g.hoursPlayed,
          status: g.status ?? null,
          format: g.format,
          edition: g.edition,
          coverColor: g.coverColor,
          price: g.price ?? undefined,
          purchasedAt: isWishlist ? null : (g.purchasedAt ?? undefined),
          notes: g.notes ?? null,
        },
        () => g.externalId,
      );
      if (!r.ok) return err({ kind: 'domain_error', scope: 'games', index: i, error: r.error });
      newGames.push(r.value);
    }

    const plan: ImportPlan = { platforms: newPlatforms, games: newGames };
    const report = await this.importRepo.apply(userId, plan, mode);
    return ok(report);
  }
}

function findFirstDuplicate(values: string[]): { value: string; indices: number[] } | null {
  const seen = new Map<string, number[]>();
  values.forEach((v, i) => {
    const arr = seen.get(v) ?? [];
    arr.push(i);
    seen.set(v, arr);
  });
  for (const [value, indices] of seen) if (indices.length > 1) return { value, indices };
  return null;
}
