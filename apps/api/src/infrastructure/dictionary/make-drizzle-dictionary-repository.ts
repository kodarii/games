import { and, eq } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import {
  Dictionary,
  type DictionaryKind,
  type DictionaryRepository,
  type DictionaryRow,
  type NewDictionary,
} from '../../domain/dictionary/dictionary';
import { db as defaultDb } from '../db/client';
import type { DrizzleHandle } from '../games/drizzle-game-repository';

/**
 * Shape of any Drizzle table the generic dictionary repository can drive.
 * Every dictionary table in the schema (genres / developers / platforms)
 * already exposes these four columns with the exact same semantics; adding
 * a new dictionary means adding a table that satisfies this contract.
 * Column-level safety is preserved via the explicit select projections
 * below, which constrain the returned row shape to `DrizzleDictionaryRow`.
 */
export type DictionaryTable = SQLiteTable & {
  id: SQLiteColumn;
  externalId: SQLiteColumn;
  userId: SQLiteColumn;
  name: SQLiteColumn;
};

export interface DrizzleDictionaryRow {
  id: number;
  externalId: string;
  userId: string;
  name: string;
}

export interface MakeDrizzleDictionaryRepositoryDeps<TKind extends DictionaryKind> {
  table: DictionaryTable;
  kind: TKind;
  db?: DrizzleHandle;
}

export function makeDrizzleDictionaryRepository<TKind extends DictionaryKind>(
  deps: MakeDrizzleDictionaryRepositoryDeps<TKind>,
): DictionaryRepository<TKind> {
  const { table, kind } = deps;
  const db: DrizzleHandle = deps.db ?? defaultDb;

  const mapRow = (raw: DrizzleDictionaryRow): Dictionary<TKind> => {
    const row: DictionaryRow = {
      id: raw.id,
      externalId: raw.externalId,
      userId: raw.userId,
      name: raw.name,
    };
    return Dictionary.fromPersistence(row, kind);
  };

  return {
    withTx(tx) {
      return makeDrizzleDictionaryRepository({ table, kind, db: tx as DrizzleHandle });
    },

    async list(userId) {
      const rows = await db
        .select({
          id: table.id,
          externalId: table.externalId,
          userId: table.userId,
          name: table.name,
        })
        .from(table)
        .where(eq(table.userId, userId))
        .orderBy(table.name);
      return (rows as DrizzleDictionaryRow[]).map(mapRow);
    },

    async findById(id) {
      const rows = await db
        .select({
          id: table.id,
          externalId: table.externalId,
          userId: table.userId,
          name: table.name,
        })
        .from(table)
        .where(eq(table.id, id))
        .limit(1);
      const row = (rows as DrizzleDictionaryRow[])[0];
      return row ? mapRow(row) : null;
    },

    async findByName(userId, name) {
      const rows = await db
        .select({
          id: table.id,
          externalId: table.externalId,
          userId: table.userId,
          name: table.name,
        })
        .from(table)
        .where(and(eq(table.userId, userId), eq(table.name, name)))
        .limit(1);
      const row = (rows as DrizzleDictionaryRow[])[0];
      return row ? mapRow(row) : null;
    },

    async create(entry: NewDictionary<TKind>) {
      const inserted = await db
        .insert(table)
        .values({
          externalId: entry.externalId,
          userId: entry.userId,
          name: entry.name,
        })
        .returning({
          id: table.id,
          externalId: table.externalId,
          userId: table.userId,
          name: table.name,
        });
      const row = (inserted as DrizzleDictionaryRow[])[0];
      if (!row) {
        throw new Error(`dictionary insert returned no row for kind=${kind}`);
      }
      return mapRow(row);
    },

    async delete(id) {
      const deleted = await db.delete(table).where(eq(table.id, id)).returning({
        id: table.id,
        externalId: table.externalId,
        userId: table.userId,
        name: table.name,
      });
      const row = (deleted as DrizzleDictionaryRow[])[0];
      return row ? mapRow(row) : null;
    },
  };
}
