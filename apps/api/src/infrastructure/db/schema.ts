import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const games = sqliteTable('games', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  developer: text('developer').notNull(),
  genre: text('genre').notNull(),
  releaseYear: integer('release_year').notNull(),
  platform: text('platform').notNull(),
  edition: text('edition'),
  hoursPlayed: integer('hours_played').notNull().default(0),
  status: text('status').notNull().default('Backlog'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export type GameRow = typeof games.$inferSelect;
export type NewGameRow = typeof games.$inferInsert;
