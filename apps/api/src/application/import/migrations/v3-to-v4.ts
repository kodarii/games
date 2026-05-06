import type { ImportSnapshotV3 } from '@apex/shared';
import type { ImportSnapshotV4 } from '@apex/shared';

export function migrateV3toV4(snap: ImportSnapshotV3): ImportSnapshotV4 {
  return {
    version: 4,
    exportedAt: snap.exportedAt,
    platforms: snap.platforms,
    games: snap.games.map((g) => ({ ...g, notes: null })),
  };
}
