import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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
    releaseYear: integer('release_year').notNull(),
    platform: text('platform').notNull(),
    edition: text('edition'),
    hoursPlayed: integer('hours_played').notNull().default(0),
    status: text('status').notNull().default('Backlog'),
    format: text('format').notNull().default('digital'),
    coverColor: text('cover_color'),
    createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  },
  (table) => [index('games_user_id_idx').on(table.userId)],
);

export type GameRow = typeof games.$inferSelect;
export type NewGameRow = typeof games.$inferInsert;
