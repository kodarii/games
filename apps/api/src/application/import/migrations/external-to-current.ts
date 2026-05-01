import type { ImportSnapshotExternal, ImportSnapshotV2 } from '@apex/shared';

export function externalToCurrent(
  ext: ImportSnapshotExternal,
  idGenerator: () => string,
  now: () => string,
): ImportSnapshotV2 {
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
  return { version: 2, exportedAt: now(), platforms, games };
}
