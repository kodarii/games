import { z } from 'zod';
import {
  type Game,
  type GameProps,
  type GameValidationError,
  NewGame,
} from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import type { CoverStorage } from '../cover-storage/cover-storage';

const purchasedAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'invalid date')
  .nullable()
  .optional();

const OwnedSchema = z.object({
  kind: z.literal('owned'),
  title: z.string().min(1),
  developer: z.string().optional().nullable(),
  genre: z.string().optional().default(''),
  releaseYear: z.coerce.number().int().min(1970).max(2100).optional(),
  platform: z.string().min(1),
  edition: z.string().optional().default(''),
  hoursPlayed: z.coerce.number().min(0).default(0),
  status: z.enum(['Playing', 'Completed', 'Backlog', 'Dropped']).default('Backlog'),
  format: z.enum(['physical', 'digital']).default('physical'),
  coverColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  coverImage: z.string().url().nullable().optional(),
  price: z.number().int().min(0).nullable().optional(),
  purchasedAt: purchasedAtSchema,
});

const WishlistSchema = z.object({
  kind: z.literal('wishlist'),
  title: z.string().min(1),
  developer: z.string().optional().nullable(),
  genre: z.string().optional().default(''),
  releaseYear: z.coerce.number().int().min(1970).max(2100).optional(),
  platform: z.string().min(1),
  edition: z.string().optional().default(''),
  format: z.enum(['physical', 'digital']).default('digital'),
  coverColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  coverImage: z.string().url().nullable().optional(),
  price: z.number().int().min(0).nullable().optional(),
}).strict();

const UpdateGameInputSchema = z.discriminatedUnion('kind', [OwnedSchema, WishlistSchema]);

export type UpdateGameInput = z.infer<typeof UpdateGameInputSchema>;

export type UpdateGameError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: GameValidationError }
  | { kind: 'not_found' };

export class UpdateGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly platformRepo: PlatformRepository,
    private readonly coverStorage: CoverStorage,
  ) {}

  async execute(
    id: number,
    input: unknown,
    userId: string,
  ): Promise<Result<Game, UpdateGameError>> {
    const inputWithKind =
      typeof input === 'object' && input !== null && !('kind' in input)
        ? { ...input, kind: 'owned' }
        : input;

    const parsed = UpdateGameInputSchema.safeParse(inputWithKind);
    if (!parsed.success) {
      return err({ kind: 'invalid_input', issues: parsed.error.issues });
    }

    const existing = await this.repo.findById(id);
    if (!existing || existing.userId !== userId) {
      return err({ kind: 'not_found' });
    }

    const data = parsed.data;

    const platform = await this.platformRepo.findByName(userId, data.platform);
    if (!platform) {
      return err({
        kind: 'domain',
        error: { kind: 'platform_invalid', value: data.platform },
      });
    }

    const props: GameProps =
      data.kind === 'wishlist'
        ? {
            kind: 'wishlist',
            userId: existing.userId,
            title: data.title,
            developer: data.developer ?? null,
            genre: data.genre,
            releaseYear: data.releaseYear,
            platform: data.platform,
            edition: data.edition || undefined,
            hoursPlayed: null,
            status: null,
            format: data.format,
            coverColor: data.coverColor,
            coverImage: data.coverImage ?? undefined,
            price: data.price ?? undefined,
            purchasedAt: null,
          }
        : {
            kind: 'owned',
            userId: existing.userId,
            title: data.title,
            developer: data.developer ?? null,
            genre: data.genre,
            releaseYear: data.releaseYear,
            platform: data.platform,
            edition: data.edition || undefined,
            hoursPlayed: data.hoursPlayed,
            status: data.status,
            format: data.format,
            coverColor: data.coverColor,
            coverImage: data.coverImage ?? undefined,
            price: data.price ?? undefined,
            purchasedAt: data.purchasedAt ?? undefined,
          };

    const gameUpdateResult = NewGame.create(props);
    if (!gameUpdateResult.ok) {
      return err({ kind: 'domain', error: gameUpdateResult.error });
    }

    const updated = await this.repo.update(id, gameUpdateResult.value);
    if (!updated) {
      return err({ kind: 'not_found' });
    }

    const oldUrl = existing.coverImage;
    const newUrl = updated.coverImage;
    if (oldUrl && oldUrl !== newUrl) {
      void this.coverStorage.delete(oldUrl).catch((err) => {
        console.warn('[update-game] cover cleanup failed', { id, oldUrl, err });
      });
    }

    return ok(updated);
  }
}
