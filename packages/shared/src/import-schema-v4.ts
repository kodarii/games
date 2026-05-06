import { z } from 'zod';
import { ImportedPlatformV3, ImportedGameV3 } from './import-schema-v3';

export const ImportedPlatformV4 = ImportedPlatformV3;

export const ImportedGameV4 = ImportedGameV3.extend({
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
