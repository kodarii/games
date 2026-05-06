import { z } from 'zod';
import { ImportedPlatformV3, ImportedGameV3 } from './import-schema-v3';

export const ImportedPlatformV4 = ImportedPlatformV3;

const StatusV4 = z.enum(['Playing', 'Completed', 'Backlog', 'Dropped']);

export const ImportedGameV4 = ImportedGameV3.extend({
  kind: z.enum(['owned', 'wishlist']),
  status: StatusV4.nullable(),
  notes: z.string().nullable().optional(),
});

export const ImportSnapshotV4Schema = z.object({
  version: z.literal(4),
  exportedAt: z.string(),
  platforms: z.array(ImportedPlatformV4),
  games: z.array(ImportedGameV4),
});

export type ImportSnapshotV4 = z.infer<typeof ImportSnapshotV4Schema>;
export type ImportedGameV4T = z.infer<typeof ImportedGameV4>;
export type ImportedPlatformV4T = z.infer<typeof ImportedPlatformV4>;
