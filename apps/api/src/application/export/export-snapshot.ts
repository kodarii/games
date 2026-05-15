import type { Game } from '../../domain/games/game';
import type { GameStatus } from '../../domain/games/game-value-objects';
import type { Platform } from '../../domain/platforms/platform';

export const EXPORT_SCHEMA_VERSION = 4 as const;

export interface ExportedPlatform {
  externalId: string;
  name: string;
}

/**
 * FIXME(BE-02c, F-08-1): Export-side drop of `coverImage` and the 3
 * `metadata*` columns persisted by the games table.
 *
 * The v4 snapshot schema (packages/shared/src/import-schema-v4.ts) does
 * not declare these fields, so this interface intentionally omits them
 * to stay symmetric with the schema. The trade-off: a snapshot exported
 * today cannot round-trip cover art or IGDB matches; they are repo-
 * persisted (BE-02b, plan 05-08) but not snapshot-portable.
 *
 * When v5 lands (see corresponding FIXME(BE-02c, F-08-1) block in
 * apps/api/src/application/import/import-data.ts), this mapping must
 * emit the 4 columns AND the v5 zod schema in @apex/shared must accept
 * them. Both directions of the round-trip then become load-bearing,
 * and the `not.toHaveProperty` pins in round-trip.test.ts Test 1 flip
 * to positive preservation.
 *
 * Discovery: `grep -r 'FIXME(BE-02c' apps/api/src` returns 4 hits.
 */
export interface ExportedGame {
  externalId: string;
  kind: 'owned' | 'wishlist';
  title: string;
  developer: string | null;
  genre: string;
  releaseYear: number | null;
  platform: string;
  hoursPlayed: number | null;
  status: GameStatus | null;
  format: 'physical' | 'digital';
  edition?: string;
  coverColor?: string;
  price: number | null;
  purchasedAt: string | null;
  notes: string | null;
}

export interface ExportSnapshot {
  version: typeof EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  platforms: ExportedPlatform[];
  games: ExportedGame[];
}

export function toSnapshot(games: Game[], platforms: Platform[], now: Date): ExportSnapshot {
  const sortedPlatforms = [...platforms]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map<ExportedPlatform>((p) => ({ externalId: p.externalId, name: p.name }));

  const sortedGames = [...games]
    .sort((a, b) => {
      const byTitle = a.title.localeCompare(b.title);
      if (byTitle !== 0) return byTitle;
      return (
        (a.releaseYear?.value ?? Number.POSITIVE_INFINITY) -
        (b.releaseYear?.value ?? Number.POSITIVE_INFINITY)
      );
    })
    .map<ExportedGame>((g) => ({
      externalId: g.externalId,
      kind: g.kind,
      title: g.title,
      developer: g.developer,
      genre: g.genre,
      releaseYear: g.releaseYear?.value ?? null,
      platform: g.platform,
      hoursPlayed: g.hoursPlayed?.value ?? null,
      status: g.status,
      format: g.format,
      ...(g.edition !== undefined && { edition: g.edition }),
      ...(g.coverColor !== undefined && { coverColor: g.coverColor }),
      price: g.price?.value ?? null,
      purchasedAt: g.purchasedAt?.value ?? null,
      notes: g.notes,
    }));

  return {
    version: EXPORT_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    platforms: sortedPlatforms,
    games: sortedGames,
  };
}
