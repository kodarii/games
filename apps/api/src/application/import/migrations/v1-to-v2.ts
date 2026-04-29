import type { ImportSnapshotV1, ImportSnapshotV2 } from '@apex/shared';

export function migrateV1toV2(v1: ImportSnapshotV1, idGenerator: () => string): ImportSnapshotV2 {
  return {
    version: 2,
    exportedAt: v1.exportedAt,
    platforms: v1.platforms.map((p) => ({ externalId: idGenerator(), ...p })),
    games: v1.games.map((g) => ({ externalId: idGenerator(), ...g })),
  };
}
