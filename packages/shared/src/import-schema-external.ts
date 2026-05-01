import { z } from 'zod';

const Status = z.enum(['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist']);
const Format = z.enum(['physical', 'digital']);
const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const ImportedGameExternal = z.object({
  title: z.string().min(1),
  releaseYear: z.number().int().min(1970).max(2100).nullish(),
  platform: z.string().min(1),
  format: Format,
  coverColor: HexColor.optional(),
  developer: z.string().min(1).optional(),
  genre: z.string().optional(),
  hoursPlayed: z.number().min(0).optional(),
  status: Status.optional(),
  edition: z.string().optional(),
});

export const ImportSnapshotExternalSchema = z.object({
  games: z.array(ImportedGameExternal),
});

export type ImportSnapshotExternal = z.infer<typeof ImportSnapshotExternalSchema>;
export type ImportedGameExternalT = z.infer<typeof ImportedGameExternal>;
