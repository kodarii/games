import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { user } from './auth-schema';

export const games = sqliteTable(
  'games',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    developer: text('developer').notNull(),
    genre: text('genre').notNull(),
    releaseYear: integer('release_year'),
    platform: text('platform').notNull(),
    edition: text('edition'),
    hoursPlayed: integer('hours_played').notNull().default(0),
    status: text('status').notNull().default('Backlog'),
    format: text('format').notNull().default('digital'),
    coverColor: text('cover_color'),
    coverImage: text('cover_image'),
    price: integer('price'),
    purchasedAt: text('purchased_at'),
    externalId: text('external_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [
    index('games_user_id_idx').on(table.userId),
    uniqueIndex('games_user_id_external_id_unq').on(table.userId, table.externalId),
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
