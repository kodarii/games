import { and, eq } from 'drizzle-orm';
import { Platform, type NewPlatform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { db } from '../db/client';
import type { PlatformRow } from '../db/schema';
import { platforms as platformsTable } from '../db/schema';

export class DrizzlePlatformRepository implements PlatformRepository {
  private mapRowToPlatform(row: PlatformRow): Platform {
    return Platform.fromPersistence({
      id: row.id,
      externalId: row.externalId,
      userId: row.userId,
      name: row.name,
    });
  }

  async list(userId: string): Promise<Platform[]> {
    const rows = await db
      .select()
      .from(platformsTable)
      .where(eq(platformsTable.userId, userId))
      .orderBy(platformsTable.name);
    return rows.map((r) => this.mapRowToPlatform(r));
  }

  async findById(id: number): Promise<Platform | null> {
    const [row] = await db
      .select()
      .from(platformsTable)
      .where(eq(platformsTable.id, id))
      .limit(1);
    return row ? this.mapRowToPlatform(row) : null;
  }

  async findByName(userId: string, name: string): Promise<Platform | null> {
    const [row] = await db
      .select()
      .from(platformsTable)
      .where(and(eq(platformsTable.userId, userId), eq(platformsTable.name, name)))
      .limit(1);
    return row ? this.mapRowToPlatform(row) : null;
  }

  async findByExternalId(userId: string, externalId: string): Promise<Platform | null> {
    const [row] = await db
      .select()
      .from(platformsTable)
      .where(and(eq(platformsTable.userId, userId), eq(platformsTable.externalId, externalId)))
      .limit(1);
    return row ? this.mapRowToPlatform(row) : null;
  }

  async create(newPlatform: NewPlatform): Promise<Platform> {
    const [inserted] = await db
      .insert(platformsTable)
      .values({ externalId: newPlatform.externalId, userId: newPlatform.userId, name: newPlatform.name })
      .returning();
    return this.mapRowToPlatform(inserted);
  }

  async delete(id: number): Promise<Platform | null> {
    const [deleted] = await db
      .delete(platformsTable)
      .where(eq(platformsTable.id, id))
      .returning();
    return deleted ? this.mapRowToPlatform(deleted) : null;
  }
}
