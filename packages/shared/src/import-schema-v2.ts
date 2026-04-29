import { z } from 'zod';
import { ImportedGameV1 } from './import-schema-v1';

export const ImportedPlatformV2 = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1).max(40),
});

export const ImportedGameV2 = ImportedGameV1.extend({
  externalId: z.string().min(1),
});

export const ImportSnapshotV2Schema = z.object({
  version: z.literal(2),
  exportedAt: z.string(),
  platforms: z.array(ImportedPlatformV2),
  games: z.array(ImportedGameV2),
});

export type ImportSnapshotV2 = z.infer<typeof ImportSnapshotV2Schema>;
export type ImportedPlatformV2T = z.infer<typeof ImportedPlatformV2>;
export type ImportedGameV2T = z.infer<typeof ImportedGameV2>;
