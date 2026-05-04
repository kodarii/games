import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import {
  Game,
  type GameFormat,
  type GamePlatform,
  type GameStatus,
  type NewGame,
} from '../../domain/games/game';
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
      externalId: row.externalId,
      userId: row.userId,
      title: row.title,
      developer: row.developer,
      genre: row.genre,
      releaseYear: row.releaseYear,
      platform: row.platform as GamePlatform,
      edition: row.edition,
      hoursPlayed: row.hoursPlayed,
      status: row.status as GameStatus,
      format: row.format as GameFormat,
      coverColor: row.coverColor,
      coverImage: row.coverImage,
      price: row.price,
      purchasedAt: row.purchasedAt,
    });
  }

  async list(query: ListGamesQuery): Promise<ListGamesResult> {
    const { userId, search, page, perPage, sort, dir } = query;

    const userFilter = eq(gamesTable.userId, userId);
    const whereClause = search
      ? and(
          userFilter,
          or(
            like(gamesTable.title, `%${search}%`),
            like(gamesTable.developer, `%${search}%`),
            like(gamesTable.genre, `%${search}%`),
            like(gamesTable.platform, `%${search}%`),
          ),
        )
      : userFilter;

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(gamesTable)
      .where(whereClause);
    const total = totalResult[0]?.count ?? 0;

    const sortColumn = sort
      ? {
          title: gamesTable.title,
          genre: gamesTable.genre,
          platform: gamesTable.platform,
          format: gamesTable.format,
          status: gamesTable.status,
          releaseYear: gamesTable.releaseYear,
          hoursPlayed: gamesTable.hoursPlayed,
        }[sort]
      : undefined;

    const offset = (page - 1) * perPage;

    let baseQuery = db.select().from(gamesTable).where(whereClause).$dynamic();
    if (sortColumn) {
      const isReleaseYear = sort === 'releaseYear';
      const order =
        dir === 'desc'
          ? isReleaseYear ? sql`${gamesTable.releaseYear} DESC NULLS LAST` : desc(sortColumn)
          : asc(sortColumn);
      baseQuery = baseQuery.orderBy(order);
    }
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

  async findByExternalId(userId: string, externalId: string): Promise<Game | null> {
    const [row] = await db
      .select()
      .from(gamesTable)
      .where(and(eq(gamesTable.userId, userId), eq(gamesTable.externalId, externalId)))
      .limit(1);
    return row ? this.mapRowToGame(row) : null;
  }

  async create(newGame: NewGame): Promise<Game> {
    const [inserted] = await db
      .insert(gamesTable)
      .values({
        externalId: newGame.externalId,
        userId: newGame.userId,
        title: newGame.title,
        developer: newGame.developer,
        genre: newGame.genre,
        releaseYear: newGame.releaseYear?.value ?? null,
        platform: newGame.platform,
        edition: newGame.edition ?? null,
        hoursPlayed: newGame.hoursPlayed.value,
        status: newGame.status,
        format: newGame.format,
        coverColor: newGame.coverColor ?? null,
        coverImage: newGame.coverImage ?? null,
        price: newGame.price?.value ?? null,
        purchasedAt: newGame.purchasedAt?.value ?? null,
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
        releaseYear: game.releaseYear?.value ?? null,
        platform: game.platform,
        edition: game.edition ?? null,
        hoursPlayed: game.hoursPlayed.value,
        status: game.status,
        format: game.format,
        coverColor: game.coverColor ?? null,
        coverImage: game.coverImage ?? null,
        price: game.price?.value ?? null,
        purchasedAt: game.purchasedAt?.value ?? null,
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

  async listAll(userId: string): Promise<Game[]> {
    const rows = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.userId, userId))
      .orderBy(asc(gamesTable.id));
    return rows.map((row) => this.mapRowToGame(row));
  }

  async countByPlatform(userId: string, platformName: string): Promise<number> {
    const r = await db
      .select({ count: sql<number>`count(*)` })
      .from(gamesTable)
      .where(and(eq(gamesTable.userId, userId), eq(gamesTable.platform, platformName)));
    return r[0]?.count ?? 0;
  }

  async findAllCoverImages(): Promise<string[]> {
    const rows = await db
      .select({ coverImage: gamesTable.coverImage })
      .from(gamesTable)
      .where(sql`${gamesTable.coverImage} IS NOT NULL`);
    return rows.map((r) => r.coverImage).filter((u): u is string => u != null);
  }
}
