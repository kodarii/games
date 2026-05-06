import { and, eq } from 'drizzle-orm';
import { Developer, type NewDeveloper } from '../../domain/developers/developer';
import type { DeveloperRepository } from '../../domain/developers/developer-repository';
import { db } from '../db/client';
import type { DeveloperRow } from '../db/schema';
import { developers as developersTable } from '../db/schema';

export class DrizzleDeveloperRepository implements DeveloperRepository {
  private map(row: DeveloperRow): Developer {
    return Developer.fromPersistence({ id: row.id, externalId: row.externalId, userId: row.userId, name: row.name });
  }

  async list(userId: string): Promise<Developer[]> {
    const rows = await db.select().from(developersTable).where(eq(developersTable.userId, userId)).orderBy(developersTable.name);
    return rows.map((r) => this.map(r));
  }

  async findById(id: number): Promise<Developer | null> {
    const [row] = await db.select().from(developersTable).where(eq(developersTable.id, id)).limit(1);
    return row ? this.map(row) : null;
  }

  async findByName(userId: string, name: string): Promise<Developer | null> {
    const [row] = await db
      .select()
      .from(developersTable)
      .where(and(eq(developersTable.userId, userId), eq(developersTable.name, name)))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async create(newDeveloper: NewDeveloper): Promise<Developer> {
    const [inserted] = await db
      .insert(developersTable)
      .values({ externalId: newDeveloper.externalId, userId: newDeveloper.userId, name: newDeveloper.name })
      .returning();
    return this.map(inserted);
  }

  async delete(id: number): Promise<Developer | null> {
    const [deleted] = await db.delete(developersTable).where(eq(developersTable.id, id)).returning();
    return deleted ? this.map(deleted) : null;
  }
}
