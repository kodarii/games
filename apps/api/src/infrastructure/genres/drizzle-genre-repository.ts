import { and, eq } from 'drizzle-orm';
import { Genre, type NewGenre } from '../../domain/genres/genre';
import type { GenreRepository } from '../../domain/genres/genre-repository';
import { db } from '../db/client';
import type { GenreRow } from '../db/schema';
import { genres as genresTable } from '../db/schema';

export class DrizzleGenreRepository implements GenreRepository {
  private map(row: GenreRow): Genre {
    return Genre.fromPersistence({ id: row.id, externalId: row.externalId, userId: row.userId, name: row.name });
  }

  async list(userId: string): Promise<Genre[]> {
    const rows = await db.select().from(genresTable).where(eq(genresTable.userId, userId)).orderBy(genresTable.name);
    return rows.map((r) => this.map(r));
  }

  async findById(id: number): Promise<Genre | null> {
    const [row] = await db.select().from(genresTable).where(eq(genresTable.id, id)).limit(1);
    return row ? this.map(row) : null;
  }

  async findByName(userId: string, name: string): Promise<Genre | null> {
    const [row] = await db
      .select()
      .from(genresTable)
      .where(and(eq(genresTable.userId, userId), eq(genresTable.name, name)))
      .limit(1);
    return row ? this.map(row) : null;
  }

  async create(newGenre: NewGenre): Promise<Genre> {
    const [inserted] = await db
      .insert(genresTable)
      .values({ externalId: newGenre.externalId, userId: newGenre.userId, name: newGenre.name })
      .returning();
    return this.map(inserted);
  }

  async delete(id: number): Promise<Genre | null> {
    const [deleted] = await db.delete(genresTable).where(eq(genresTable.id, id)).returning();
    return deleted ? this.map(deleted) : null;
  }
}
