import type { ImportSnapshotV2, ImportSnapshotV3 } from '@apex/shared';

export function migrateV2toV3(snap: ImportSnapshotV2): ImportSnapshotV3 {
  return {
    version: 3,
    exportedAt: snap.exportedAt,
    platforms: snap.platforms,
    games: snap.games.map((g) => ({ ...g, price: null, purchasedAt: null })),
  };
}
