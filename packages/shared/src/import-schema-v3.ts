import { z } from 'zod';
import { ImportedGameV2, ImportedPlatformV2 } from './import-schema-v2';

const PURCHASED_AT_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const isValidIsoDate = (s: string) => {
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const ImportedPlatformV3 = ImportedPlatformV2;

export const ImportedGameV3 = ImportedGameV2.extend({
  price: z.number().int().min(0).nullable().optional(),
  purchasedAt: z
    .string()
    .regex(PURCHASED_AT_REGEX)
    .refine(isValidIsoDate, 'invalid date')
    .nullable()
    .optional(),
});

export const ImportSnapshotV3Schema = z.object({
  version: z.literal(3),
  exportedAt: z.string(),
  platforms: z.array(ImportedPlatformV3),
  games: z.array(ImportedGameV3),
});

export type ImportSnapshotV3 = z.infer<typeof ImportSnapshotV3Schema>;
export type ImportedGameV3T = z.infer<typeof ImportedGameV3>;
export type ImportedPlatformV3T = z.infer<typeof ImportedPlatformV3>;
