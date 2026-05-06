import type { GameRepository } from '../../domain/games/game-repository';
import type { CoverStorage } from './cover-storage';

function extractKey(url: string): string {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    return segs[segs.length - 1] ?? url;
  } catch {
    return url;
  }
}

export class CleanupOrphans {
  constructor(
    private readonly storage: CoverStorage,
    private readonly gameRepo: GameRepository,
  ) {}

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
    const dbKeys = new Set(dbUrls.map(extractKey));
    const orphans = oldUrls.filter((u) => !dbKeys.has(extractKey(u)));

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
