import type { Game, GameStatus } from '../../domain/games/game';
import type { Platform } from '../../domain/platforms/platform';

export const EXPORT_SCHEMA_VERSION = 4 as const;

export interface ExportedPlatform {
  externalId: string;
  name: string;
}

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
      return (a.releaseYear?.value ?? Infinity) - (b.releaseYear?.value ?? Infinity);
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
