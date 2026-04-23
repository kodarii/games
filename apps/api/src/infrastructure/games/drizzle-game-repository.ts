import { and, desc, eq, sql } from 'drizzle-orm';
import type { Game, NewGame } from '../../domain/games/game';
import type {
  GameRepository,
  ListGamesQuery,
  ListGamesResult,
} from '../../domain/games/game-repository';
import { db } from '../db/client';
import type { GameRow } from '../db/schema';
import { games as gamesTable } from '../db/schema';

export class DrizzleGameRepository implements GameRepository {
  private mapRowToGame(row: GameRow): Game {
    return {
      id: row.id,
      title: row.title,
      developer: row.developer,
      genre: row.genre,
      releaseYear: row.releaseYear,
      platform: row.platform as Game['platform'],
      edition: row.edition ?? undefined,
      hoursPlayed: row.hoursPlayed,
      status: row.status as Game['status'],
    };
  }

  async list(query: ListGamesQuery): Promise<ListGamesResult> {
    const { search, page, perPage, sort, dir } = query;

    const totalResult = await db.select({ count: sql<number>`count(*)` }).from(gamesTable);

    const total = totalResult[0]?.count ?? 0;

    const offset = (page - 1) * perPage;

    let items: GameRow[];

    if (search) {
      const searchLower = `%${search}%`;
      items = await db
        .select()
        .from(gamesTable)
        .where(
          sql`${gamesTable.title} LIKE ${searchLower} OR ${gamesTable.developer} LIKE ${searchLower} OR ${gamesTable.genre} LIKE ${searchLower} OR ${gamesTable.platform} LIKE ${searchLower}`,
        )
        .limit(perPage)
        .offset(offset);
    } else {
      items = await db.select().from(gamesTable).limit(perPage).offset(offset);
    }

    if (sort) {
      const sortCol = sort as keyof GameRow;
      items.sort((a, b) => {
        const aVal = a[sortCol];
        const bVal = b[sortCol];
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        return dir === 'asc' ? Number(aVal) - Number(bVal) : Number(bVal) - Number(aVal);
      });
    }

    return { items: items.map((row) => this.mapRowToGame(row)), total };
  }

  async findById(id: number): Promise<Game | null> {
    const result = await db.select().from(gamesTable).where(eq(gamesTable.id, id)).limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapRowToGame(result[0]);
  }

  async create(game: NewGame): Promise<Game> {
    const [inserted] = await db
      .insert(gamesTable)
      .values({
        title: game.title,
        developer: game.developer,
        genre: game.genre,
        releaseYear: game.releaseYear,
        platform: game.platform,
        edition: game.edition ?? null,
        hoursPlayed: game.hoursPlayed,
        status: game.status,
      })
      .returning();

    return this.mapRowToGame(inserted);
  }

  async update(id: number, game: NewGame): Promise<Game | null> {
    const [updated] = await db
      .update(gamesTable)
      .set({
        title: game.title,
        developer: game.developer,
        genre: game.genre,
        releaseYear: game.releaseYear,
        platform: game.platform,
        edition: game.edition ?? null,
        hoursPlayed: game.hoursPlayed,
        status: game.status,
      })
      .where(eq(gamesTable.id, id))
      .returning();

    if (!updated) return null;
    return this.mapRowToGame(updated);
  }

  async delete(id: number): Promise<Game | null> {
    const [deleted] = await db.delete(gamesTable).where(eq(gamesTable.id, id)).returning();

    if (!deleted) return null;
    return this.mapRowToGame(deleted);
  }
}
