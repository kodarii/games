import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { Game, type GamePlatform, type GameStatus, type NewGame } from '../../domain/games/game';
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
    return Game.fromPersistence({
      id: row.id,
      title: row.title,
      developer: row.developer,
      genre: row.genre,
      releaseYear: row.releaseYear,
      platform: row.platform as GamePlatform,
      edition: row.edition,
      hoursPlayed: row.hoursPlayed,
      status: row.status as GameStatus,
    });
  }

  async list(query: ListGamesQuery): Promise<ListGamesResult> {
    const { search, page, perPage, sort, dir } = query;

    const whereClause = search
      ? or(
          like(gamesTable.title, `%${search}%`),
          like(gamesTable.developer, `%${search}%`),
          like(gamesTable.genre, `%${search}%`),
          like(gamesTable.platform, `%${search}%`),
        )
      : undefined;

    const totalQuery = whereClause
      ? db.select({ count: sql<number>`count(*)` }).from(gamesTable).where(whereClause)
      : db.select({ count: sql<number>`count(*)` }).from(gamesTable);
    const totalResult = await totalQuery;
    const total = totalResult[0]?.count ?? 0;

    const sortColumn = sort
      ? {
          title: gamesTable.title,
          genre: gamesTable.genre,
          platform: gamesTable.platform,
          status: gamesTable.status,
          releaseYear: gamesTable.releaseYear,
          hoursPlayed: gamesTable.hoursPlayed,
        }[sort]
      : undefined;

    const offset = (page - 1) * perPage;

    let baseQuery = db.select().from(gamesTable).$dynamic();
    if (whereClause) baseQuery = baseQuery.where(whereClause);
    if (sortColumn)
      baseQuery = baseQuery.orderBy(dir === 'desc' ? desc(sortColumn) : asc(sortColumn));
    const items = await baseQuery.limit(perPage).offset(offset);

    return { items: items.map((row) => this.mapRowToGame(row)), total };
  }

  async findById(id: number): Promise<Game | null> {
    const result = await db.select().from(gamesTable).where(eq(gamesTable.id, id)).limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapRowToGame(result[0]);
  }

  async create(newGame: NewGame): Promise<Game> {
    const [inserted] = await db
      .insert(gamesTable)
      .values({
        title: newGame.title,
        developer: newGame.developer,
        genre: newGame.genre,
        releaseYear: newGame.releaseYear.value,
        platform: newGame.platform,
        edition: newGame.edition ?? null,
        hoursPlayed: newGame.hoursPlayed.value,
        status: newGame.status,
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
        releaseYear: game.releaseYear.value,
        platform: game.platform,
        edition: game.edition ?? null,
        hoursPlayed: game.hoursPlayed.value,
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
