import type { ImportMode, ImportReport } from '@apex/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { ImportPlan, ImportRepository } from '../../domain/import/import-repository';
import { db as defaultDb } from '../db/client';
import type * as schema from '../db/schema';
import { games as gamesTable, platforms as platformsTable, toGameInsertRow } from '../db/schema';

export class DrizzleImportRepository implements ImportRepository {
  constructor(private readonly db: BunSQLiteDatabase<typeof schema> = defaultDb) {}

  async apply(userId: string, plan: ImportPlan, mode: ImportMode): Promise<ImportReport> {
    if (mode === 'merge') return this.applyMerge(userId, plan);
    return this.applyReplace(userId, plan);
  }

  private async applyMerge(userId: string, plan: ImportPlan): Promise<ImportReport> {
    return this.db.transaction(async (tx) => {
      // ── Platforms: batched read ────────────────────────────────────────
      const platformExternalIds = plan.platforms.map((p) => p.externalId);
      const existingPlatforms =
        platformExternalIds.length === 0
          ? []
          : await tx
              .select()
              .from(platformsTable)
              .where(
                and(
                  eq(platformsTable.userId, userId),
                  inArray(platformsTable.externalId, platformExternalIds),
                ),
              );
      const platformByExternalId = new Map(existingPlatforms.map((row) => [row.externalId, row]));

      let pCreated = 0;
      let pUpdated = 0;
      for (const np of plan.platforms) {
        const existing = platformByExternalId.get(np.externalId);
        if (!existing) {
          await tx
            .insert(platformsTable)
            .values({ userId, externalId: np.externalId, name: np.name });
          pCreated++;
        } else if (existing.name !== np.name) {
          await tx
            .update(platformsTable)
            .set({ name: np.name })
            .where(eq(platformsTable.id, existing.id));
          pUpdated++;
        }
      }

      // ── Games: batched read ────────────────────────────────────────────
      const gameExternalIds = plan.games.map((g) => g.externalId);
      const existingGames =
        gameExternalIds.length === 0
          ? []
          : await tx
              .select()
              .from(gamesTable)
              .where(
                and(eq(gamesTable.userId, userId), inArray(gamesTable.externalId, gameExternalIds)),
              );
      const gameByExternalId = new Map(existingGames.map((row) => [row.externalId, row]));

      let gCreated = 0;
      let gUpdated = 0;
      for (const ng of plan.games) {
        const existing = gameByExternalId.get(ng.externalId);
        const row = toGameInsertRow(userId, {
          kind: ng.kind,
          externalId: ng.externalId,
          title: ng.title,
          developer: ng.developer,
          genre: ng.genre,
          releaseYear: ng.releaseYear,
          platform: ng.platform,
          edition: ng.edition,
          hoursPlayed: ng.hoursPlayed,
          status: ng.status,
          format: ng.format,
          coverColor: ng.coverColor,
          // coverImage/price/purchasedAt/notes/metadataRef omitted — D-09:
          // import row does not carry these; helper defaults them to null.
        });
        if (!existing) {
          await tx.insert(gamesTable).values(row);
          gCreated++;
        } else {
          // UPDATE shape excludes userId/externalId/kind — strip before
          // `.set()`. Same helper-produced row, narrower update surface.
          const { userId: _u, externalId: _e, kind: _k, ...updateSet } = row;
          await tx.update(gamesTable).set(updateSet).where(eq(gamesTable.id, existing.id));
          gUpdated++;
        }
      }

      return {
        mode: 'merge',
        platforms: { created: pCreated, updated: pUpdated },
        games: { created: gCreated, updated: gUpdated },
      };
    });
  }

  private async applyReplace(userId: string, plan: ImportPlan): Promise<ImportReport> {
    return this.db.transaction(async (tx) => {
      const [{ count: gDel = 0 } = {}] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(gamesTable)
        .where(eq(gamesTable.userId, userId));
      const [{ count: pDel = 0 } = {}] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(platformsTable)
        .where(eq(platformsTable.userId, userId));

      await tx.delete(gamesTable).where(eq(gamesTable.userId, userId));
      await tx.delete(platformsTable).where(eq(platformsTable.userId, userId));

      for (const np of plan.platforms) {
        await tx
          .insert(platformsTable)
          .values({ userId, externalId: np.externalId, name: np.name });
      }
      for (const ng of plan.games) {
        await tx.insert(gamesTable).values(
          toGameInsertRow(userId, {
            kind: ng.kind,
            externalId: ng.externalId,
            title: ng.title,
            developer: ng.developer,
            genre: ng.genre,
            releaseYear: ng.releaseYear,
            platform: ng.platform,
            edition: ng.edition,
            hoursPlayed: ng.hoursPlayed,
            status: ng.status,
            format: ng.format,
            coverColor: ng.coverColor,
          }),
        );
      }

      return {
        mode: 'replace',
        platforms: { created: plan.platforms.length, updated: 0, deleted: pDel },
        games: { created: plan.games.length, updated: 0, deleted: gDel },
      };
    });
  }
}
