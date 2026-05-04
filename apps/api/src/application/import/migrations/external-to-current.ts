import type { ImportSnapshotExternal, ImportSnapshotV2, ImportSnapshotV3 } from '@apex/shared';
import { migrateV2toV3 } from './v2-to-v3';

export function externalToCurrent(
  ext: ImportSnapshotExternal,
  idGenerator: () => string,
  now: () => string,
): ImportSnapshotV3 {
  const platformNames = Array.from(new Set(ext.games.map((g) => g.platform)));
  const platforms = platformNames.map((name) => ({ externalId: idGenerator(), name }));
  const games = ext.games.map((g) => ({
    externalId: idGenerator(),
    title: g.title,
    developer: g.developer ?? 'Unknown',
    genre: g.genre ?? '',
    releaseYear: g.releaseYear ?? undefined,
    platform: g.platform,
    hoursPlayed: g.hoursPlayed ?? 0,
    status: g.status ?? ('Backlog' as const),
    format: g.format,
    edition: g.edition,
    coverColor: g.coverColor,
  }));
  const v2: ImportSnapshotV2 = { version: 2, exportedAt: now(), platforms, games };
  return migrateV2toV3(v2);
}
