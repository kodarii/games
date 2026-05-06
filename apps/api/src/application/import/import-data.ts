import type { ImportMode, ImportReport } from '@apex/shared';
import type { GameRepository } from '../../domain/games/game-repository';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import type { ImportRepository, ImportPlan } from '../../domain/import/import-repository';
import { NewGame } from '../../domain/games/game';
import { NewPlatform } from '../../domain/platforms/platform';
import { err, ok, type Result } from '../../domain/shared/result';
import { parseImport, type ImportParseError } from './parse-import';

export type ImportError =
  | ImportParseError
  | { kind: 'duplicate_external_id'; scope: 'platforms' | 'games'; externalId: string; indices: number[] }
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

  async execute(userId: string, rawJson: string, mode: ImportMode): Promise<Result<ImportReport, ImportError>> {
    const parsed = parseImport(rawJson, this.idGenerator);
    if (!parsed.ok) return err(parsed.error);
    const snap = parsed.value;

    const dupP = findFirstDuplicate(snap.platforms.map((p) => p.externalId));
    if (dupP)
      return err({ kind: 'duplicate_external_id', scope: 'platforms', externalId: dupP.value, indices: dupP.indices });

    const dupG = findFirstDuplicate(snap.games.map((g) => g.externalId));
    if (dupG)
      return err({ kind: 'duplicate_external_id', scope: 'games', externalId: dupG.value, indices: dupG.indices });

    const dupName = findFirstDuplicate(snap.platforms.map((p) => p.name));
    if (dupName) return err({ kind: 'duplicate_platform_name', name: dupName.value, indices: dupName.indices });

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
    for (const [i, g] of snap.games.entries()) {
      const isWishlist = g.kind === 'wishlist';
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
