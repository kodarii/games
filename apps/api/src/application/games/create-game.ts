import { z } from 'zod';
import type { Game } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import type { GameValidationError } from '../../domain/games/game-value-objects';
import { NewGame, type NewGameProps } from '../../domain/games/new-game';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import { isProviderSupported } from '../../infrastructure/config/providers';

const purchasedAtSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'invalid date')
  .optional();

const metadataRefSchema = z
  .object({
    providerName: z
      .string()
      .trim()
      .min(1)
      .refine(isProviderSupported, { message: 'Unsupported provider' }),
    providerId: z.string().trim().min(1),
  })
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
  format: z.enum(['physical', 'digital']).default('digital'),
  coverColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  coverImage: z.string().url().nullable().optional(),
  price: z.number().int().min(0).optional(),
  purchasedAt: purchasedAtSchema,
  notes: z.string().nullable().optional(),
  metadataRef: metadataRefSchema,
});

const WishlistSchema = z
  .object({
    kind: z.literal('wishlist'),
    title: z.string().min(1),
    developer: z.string().optional().nullable(),
    genre: z.string().optional().default(''),
    releaseYear: z.coerce.number().int().min(1970).max(2100).optional(),
    platform: z.string().min(1),
    edition: z.string().optional().default(''),
    format: z.enum(['physical', 'digital']).default('physical'),
    coverColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    coverImage: z.string().url().nullable().optional(),
    price: z.number().int().min(0).optional(),
    notes: z.string().nullable().optional(),
    metadataRef: metadataRefSchema,
  })
  .strict();

const CreateGameInputSchema = z.discriminatedUnion('kind', [OwnedSchema, WishlistSchema]);

export type CreateGameInput = z.infer<typeof CreateGameInputSchema>;

export type CreateGameError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: GameValidationError };

export class CreateGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly platformRepo: PlatformRepository,
  ) {}

  async execute(input: unknown, userId: string): Promise<Result<Game, CreateGameError>> {
    const inputWithKind =
      typeof input === 'object' && input !== null && !('kind' in input)
        ? { ...input, kind: 'owned' }
        : input;

    const parsed = CreateGameInputSchema.safeParse(inputWithKind);

    if (!parsed.success) {
      return err({ kind: 'invalid_input', issues: parsed.error.issues });
    }

    const data = parsed.data;

    const platform = await this.platformRepo.findByName(userId, data.platform);
    if (!platform) {
      return err({
        kind: 'domain',
        error: { kind: 'platform_invalid', value: data.platform },
      });
    }

    const props: NewGameProps =
      data.kind === 'wishlist'
        ? {
            kind: 'wishlist',
            userId,
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
            price: data.price,
            purchasedAt: null,
            notes: data.notes ?? null,
            metadataRef: data.metadataRef,
          }
        : {
            kind: 'owned',
            userId,
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
            price: data.price,
            purchasedAt: data.purchasedAt,
            notes: data.notes ?? null,
            metadataRef: data.metadataRef,
          };

    const newGameResult = NewGame.create(props);

    if (!newGameResult.ok) {
      return err({ kind: 'domain', error: newGameResult.error });
    }

    const game = await this.repo.create(newGameResult.value);

    return ok(game);
  }
}
