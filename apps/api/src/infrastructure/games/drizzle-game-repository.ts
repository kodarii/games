import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import {
  Game,
  type GameFormat,
  type GameKind,
  type GamePlatform,
  type GameStatus,
  type GameUpdate,
  type NewGame,
} from '../../domain/games/game';
import type {
  GameRepository,
  ListGamesQuery,
  ListGamesResult,
} from '../../domain/games/game-repository';
import { db as defaultDb } from '../db/client';
import type { GameRow } from '../db/schema';
import { games as gamesTable } from '../db/schema';

type DB = typeof defaultDb;

export class DrizzleGameRepository implements GameRepository {
  constructor(private readonly db: DB = defaultDb) {}

  private mapRowToGame(row: GameRow): Game {
    return Game.fromPersistence({
      id: row.id,
      externalId: row.externalId,
      kind: row.kind as GameKind,
      userId: row.userId,
      title: row.title,
      developer: row.developer,
      genre: row.genre,
      releaseYear: row.releaseYear,
      platform: row.platform as GamePlatform,
      edition: row.edition,
      hoursPlayed: row.hoursPlayed,
      status: row.status as GameStatus | null,
      format: row.format as GameFormat,
      coverColor: row.coverColor,
      coverImage: row.coverImage,
      price: row.price,
      purchasedAt: row.purchasedAt,
      notes: row.notes,
      metadataProvider: row.metadataProvider === 'igdb' ? 'igdb' : null,
      metadataProviderId: row.metadataProviderId,
      metadataMatchedAt: row.metadataMatchedAt,
    });
  }

  async list(query: ListGamesQuery): Promise<ListGamesResult> {
    const { userId, search, kind, page, perPage, sort, dir, platforms, formats, releaseYearRange } =
      query;

    const userFilter = eq(gamesTable.userId, userId);
    const kindFilter = kind ? eq(gamesTable.kind, kind) : undefined;

    const likePattern = search ? `%${search}%` : undefined;
    const searchFilter = likePattern
      ? sql`(
          ${gamesTable.title} LIKE ${likePattern} ESCAPE '\\'
          OR ${gamesTable.developer} LIKE ${likePattern} ESCAPE '\\'
          OR ${gamesTable.genre} LIKE ${likePattern} ESCAPE '\\'
          OR ${gamesTable.platform} LIKE ${likePattern} ESCAPE '\\'
        )`
      : undefined;

    const platformFilter =
      platforms && platforms.length > 0 ? inArray(gamesTable.platform, platforms) : undefined;
    const formatFilter =
      formats && formats.length > 0 ? inArray(gamesTable.format, formats) : undefined;
    const yearFromFilter = releaseYearRange
      ? gte(gamesTable.releaseYear, releaseYearRange.from)
      : undefined;
    const yearToFilter = releaseYearRange
      ? lte(gamesTable.releaseYear, releaseYearRange.to)
      : undefined;

    const whereClause = and(
      userFilter,
      kindFilter,
      searchFilter,
      platformFilter,
      formatFilter,
      yearFromFilter,
      yearToFilter,
    );

    const totalResult = await this.db
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

    let baseQuery = this.db.select().from(gamesTable).where(whereClause).$dynamic();
    if (sortColumn) {
      const isReleaseYear = sort === 'releaseYear';
      // dir is a Zod-validated enum ('asc' | 'desc') — sql.raw is safe here.
      const dirSql = sql.raw(dir === 'desc' ? 'DESC' : 'ASC');
      const order = isReleaseYear
        ? sql`${gamesTable.releaseYear} IS NULL, ${gamesTable.releaseYear} ${dirSql}`
        : dir === 'desc'
          ? desc(sortColumn)
          : asc(sortColumn);
      baseQuery = baseQuery.orderBy(order);
    }
    const items = await baseQuery.limit(perPage).offset(offset);

    return { items: items.map((row) => this.mapRowToGame(row)), total };
  }

  async findById(id: number): Promise<Game | null> {
    const result = await this.db.select().from(gamesTable).where(eq(gamesTable.id, id)).limit(1);

    if (result.length === 0) {
      return null;
    }

    return this.mapRowToGame(result[0]);
  }

  async findByExternalId(userId: string, externalId: string): Promise<Game | null> {
    const [row] = await this.db
      .select()
      .from(gamesTable)
      .where(and(eq(gamesTable.userId, userId), eq(gamesTable.externalId, externalId)))
      .limit(1);
    return row ? this.mapRowToGame(row) : null;
  }

  async create(newGame: NewGame): Promise<Game> {
    const metadataRef = newGame.metadataRef;
    const [inserted] = await this.db
      .insert(gamesTable)
      .values({
        externalId: newGame.externalId,
        kind: newGame.kind,
        userId: newGame.userId,
        title: newGame.title,
        developer: newGame.developer ?? null,
        genre: newGame.genre,
        releaseYear: newGame.releaseYear?.value ?? null,
        platform: newGame.platform,
        edition: newGame.edition ?? null,
        hoursPlayed: newGame.hoursPlayed?.value ?? null,
        status: newGame.status ?? null,
        format: newGame.format,
        coverColor: newGame.coverColor ?? null,
        coverImage: newGame.coverImage ?? null,
        price: newGame.price?.value ?? null,
        purchasedAt: newGame.purchasedAt?.value ?? null,
        notes: newGame.notes ?? null,
        metadataProvider: metadataRef?.providerName ?? null,
        metadataProviderId: metadataRef?.providerId ?? null,
        metadataMatchedAt: metadataRef?.matchedAt.toISOString() ?? null,
      })
      .returning();

    return this.mapRowToGame(inserted);
  }

  async update(userId: string, externalId: string, game: GameUpdate): Promise<Game | null> {
    const [updated] = await this.db
      .update(gamesTable)
      .set({
        kind: game.kind,
        title: game.title,
        developer: game.developer ?? null,
        genre: game.genre,
        releaseYear: game.releaseYear?.value ?? null,
        platform: game.platform,
        edition: game.edition ?? null,
        hoursPlayed: game.hoursPlayed?.value ?? null,
        status: game.status ?? null,
        format: game.format,
        coverColor: game.coverColor ?? null,
        coverImage: game.coverImage ?? null,
        price: game.price?.value ?? null,
        purchasedAt: game.purchasedAt?.value ?? null,
        notes: game.notes ?? null,
      })
      .where(and(eq(gamesTable.externalId, externalId), eq(gamesTable.userId, userId)))
      .returning();

    if (!updated) return null;
    return this.mapRowToGame(updated);
  }

  async saveMetadata(userId: string, externalId: string, game: Game): Promise<Game | null> {
    const ref = game.metadataRef;
    const [updated] = await this.db
      .update(gamesTable)
      .set({
        developer: game.developer ?? null,
        releaseYear: game.releaseYear?.value ?? null,
        coverImage: game.coverImage ?? null,
        metadataProvider: ref?.providerName ?? null,
        metadataProviderId: ref?.providerId ?? null,
        metadataMatchedAt: ref?.matchedAt.toISOString() ?? null,
      })
      .where(and(eq(gamesTable.externalId, externalId), eq(gamesTable.userId, userId)))
      .returning();

    if (!updated) return null;
    return this.mapRowToGame(updated);
  }

  async delete(userId: string, externalId: string): Promise<Game | null> {
    const [deleted] = await this.db
      .delete(gamesTable)
      .where(and(eq(gamesTable.externalId, externalId), eq(gamesTable.userId, userId)))
      .returning();

    if (!deleted) return null;
    return this.mapRowToGame(deleted);
  }

  async listAll(userId: string): Promise<Game[]> {
    const rows = await this.db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.userId, userId))
      .orderBy(asc(gamesTable.id));
    return rows.map((row) => this.mapRowToGame(row));
  }

  async countByPlatform(userId: string, platformName: string): Promise<number> {
    const r = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(gamesTable)
      .where(and(eq(gamesTable.userId, userId), eq(gamesTable.platform, platformName)));
    return r[0]?.count ?? 0;
  }

  async countByGenre(userId: string, genre: string): Promise<number> {
    const r = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(gamesTable)
      .where(and(eq(gamesTable.userId, userId), eq(gamesTable.genre, genre)));
    return r[0]?.count ?? 0;
  }

  async countByDeveloper(userId: string, developer: string): Promise<number> {
    const r = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(gamesTable)
      .where(and(eq(gamesTable.userId, userId), eq(gamesTable.developer, developer)));
    return r[0]?.count ?? 0;
  }

  async findAllCoverImages(): Promise<string[]> {
    const rows = await this.db
      .select({ coverImage: gamesTable.coverImage })
      .from(gamesTable)
      .where(sql`${gamesTable.coverImage} IS NOT NULL`);
    return rows.map((r) => r.coverImage).filter((u): u is string => u != null);
  }
}
