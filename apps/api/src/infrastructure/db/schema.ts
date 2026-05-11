import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';

export const games = sqliteTable(
  'games',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('owned'),
    title: text('title').notNull(),
    developer: text('developer'),
    genre: text('genre').notNull(),
    releaseYear: integer('release_year'),
    platform: text('platform').notNull(),
    edition: text('edition'),
    hoursPlayed: integer('hours_played'),
    status: text('status'),
    format: text('format').notNull().default('digital'),
    coverColor: text('cover_color'),
    coverImage: text('cover_image'),
    price: integer('price'),
    purchasedAt: text('purchased_at'),
    notes: text('notes'),
    metadataProvider: text('metadata_provider'),
    metadataProviderId: text('metadata_provider_id'),
    metadataMatchedAt: text('metadata_matched_at'),
    externalId: text('external_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('games_user_id_idx').on(table.userId),
    uniqueIndex('games_user_id_external_id_unq').on(table.userId, table.externalId),
    index('games_user_kind_idx').on(table.userId, table.kind),
    index('games_user_kind_platform_idx').on(table.userId, table.kind, table.platform),
    index('games_user_kind_format_idx').on(table.userId, table.kind, table.format),
    index('games_user_kind_releaseyear_idx').on(table.userId, table.kind, table.releaseYear),
    index('games_user_kind_title_idx').on(table.userId, table.kind, table.title),
  ],
);

export type GameRow = typeof games.$inferSelect;
export type NewGameRow = typeof games.$inferInsert;

export const platforms = sqliteTable(
  'platforms',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    externalId: text('external_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('platforms_user_id_idx').on(table.userId),
    uniqueIndex('platforms_user_id_name_unq').on(table.userId, table.name),
    uniqueIndex('platforms_user_id_external_id_unq').on(table.userId, table.externalId),
  ],
);

export type PlatformRow = typeof platforms.$inferSelect;
export type NewPlatformRow = typeof platforms.$inferInsert;

export const genres = sqliteTable(
  'genres',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    externalId: text('external_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('genres_user_id_idx').on(table.userId),
    uniqueIndex('genres_user_id_name_unq').on(table.userId, table.name),
    uniqueIndex('genres_user_id_external_id_unq').on(table.userId, table.externalId),
  ],
);

export type GenreRow = typeof genres.$inferSelect;
export type NewGenreRow = typeof genres.$inferInsert;

export const developers = sqliteTable(
  'developers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    externalId: text('external_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('developers_user_id_idx').on(table.userId),
    uniqueIndex('developers_user_id_name_unq').on(table.userId, table.name),
    uniqueIndex('developers_user_id_external_id_unq').on(table.userId, table.externalId),
  ],
);

export type DeveloperRow = typeof developers.$inferSelect;
export type NewDeveloperRow = typeof developers.$inferInsert;

export const metadataCache = sqliteTable(
  'metadata_cache',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull(),
    cacheKey: text('cache_key').notNull(),
    candidatesJson: text('candidates_json').notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    uniqueIndex('metadata_cache_provider_cache_key_unq').on(table.provider, table.cacheKey),
  ],
);

export type MetadataCacheRow = typeof metadataCache.$inferSelect;
export type NewMetadataCacheRow = typeof metadataCache.$inferInsert;

export const igdbOauthToken = sqliteTable('igdb_oauth_token', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  accessToken: text('access_token').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  obtainedAt: integer('obtained_at', { mode: 'timestamp' }).notNull(),
});

export type IgdbOauthTokenRow = typeof igdbOauthToken.$inferSelect;
export type NewIgdbOauthTokenRow = typeof igdbOauthToken.$inferInsert;
