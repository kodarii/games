import { z } from 'zod';

const Status = z.enum(['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist']);
const Format = z.enum(['physical', 'digital']);
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const ImportedPlatformV1 = z.object({ name: z.string().min(1).max(40) });

export const ImportedGameV1 = z.object({
  title: z.string().min(1),
  developer: z.string().min(1).nullable(),
  genre: z.string(),
  releaseYear: z.number().int().min(1970).max(2100).nullish(),
  platform: z.string().min(1),
  hoursPlayed: z.number().min(0).nullable(),
  status: Status,
  format: Format,
  edition: z.string().optional(),
  coverColor: HexColor.optional(),
});

export const ImportSnapshotV1Schema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  platforms: z.array(ImportedPlatformV1),
  games: z.array(ImportedGameV1),
});

export type ImportSnapshotV1 = z.infer<typeof ImportSnapshotV1Schema>;
