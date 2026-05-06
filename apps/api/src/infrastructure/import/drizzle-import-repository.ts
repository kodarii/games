import { and, eq, sql } from 'drizzle-orm';
import type { ImportMode, ImportReport } from '@apex/shared';
import type { ImportPlan, ImportRepository } from '../../domain/import/import-repository';
import { db } from '../db/client';
import { games as gamesTable, platforms as platformsTable } from '../db/schema';

export class DrizzleImportRepository implements ImportRepository {
  async apply(userId: string, plan: ImportPlan, mode: ImportMode): Promise<ImportReport> {
    if (mode === 'merge') return this.applyMerge(userId, plan);
    return this.applyReplace(userId, plan);
  }

  private async applyMerge(userId: string, plan: ImportPlan): Promise<ImportReport> {
    return db.transaction(async (tx) => {
      let pCreated = 0, pUpdated = 0;
      for (const np of plan.platforms) {
        const [existing] = await tx
          .select()
          .from(platformsTable)
          .where(and(eq(platformsTable.userId, userId), eq(platformsTable.externalId, np.externalId)))
          .limit(1);
        if (!existing) {
          await tx.insert(platformsTable).values({ userId, externalId: np.externalId, name: np.name });
          pCreated++;
        } else if (existing.name !== np.name) {
          await tx.update(platformsTable).set({ name: np.name }).where(eq(platformsTable.id, existing.id));
          pUpdated++;
        }
      }

      let gCreated = 0, gUpdated = 0;
      for (const ng of plan.games) {
        const [existing] = await tx
          .select()
          .from(gamesTable)
          .where(and(eq(gamesTable.userId, userId), eq(gamesTable.externalId, ng.externalId)))
          .limit(1);
        const values = {
          kind: ng.kind,
          title: ng.title,
          developer: ng.developer ?? null,
          genre: ng.genre,
          releaseYear: ng.releaseYear?.value ?? null,
          platform: ng.platform,
          edition: ng.edition ?? null,
          hoursPlayed: ng.hoursPlayed?.value ?? null,
          status: ng.status ?? null,
          format: ng.format,
          coverColor: ng.coverColor ?? null,
        };
        if (!existing) {
          await tx.insert(gamesTable).values({ userId, externalId: ng.externalId, ...values });
          gCreated++;
        } else {
          await tx.update(gamesTable).set(values).where(eq(gamesTable.id, existing.id));
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
    return db.transaction(async (tx) => {
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
        await tx.insert(platformsTable).values({ userId, externalId: np.externalId, name: np.name });
      }
      for (const ng of plan.games) {
        await tx.insert(gamesTable).values({
          userId,
          externalId: ng.externalId,
          kind: ng.kind,
          title: ng.title,
          developer: ng.developer ?? null,
          genre: ng.genre,
          releaseYear: ng.releaseYear?.value ?? null,
          platform: ng.platform,
          edition: ng.edition ?? null,
          hoursPlayed: ng.hoursPlayed?.value ?? null,
          status: ng.status ?? null,
          format: ng.format,
          coverColor: ng.coverColor ?? null,
        });
      }

      return {
        mode: 'replace',
        platforms: { created: plan.platforms.length, updated: 0, deleted: pDel },
        games: { created: plan.games.length, updated: 0, deleted: gDel },
      };
    });
  }
}
