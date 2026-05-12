import { z } from 'zod';
import type { Game } from '../../domain/games/game';
import { type GameRepository, OptimisticLockError } from '../../domain/games/game-repository';
import { GameUpdate, type GameUpdateProps } from '../../domain/games/game-update';
import type { GameValidationError } from '../../domain/games/game-value-objects';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import type { TransactionRunner } from '../shared/transaction-runner';

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
  notes: z.string().nullable().optional(),
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
    format: z.enum(['physical', 'digital']).default('digital'),
    coverColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    coverImage: z.string().url().nullable().optional(),
    price: z.number().int().min(0).nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

const UpdateGameInputSchema = z.discriminatedUnion('kind', [OwnedSchema, WishlistSchema]);

export type UpdateGameInput = z.infer<typeof UpdateGameInputSchema>;

export type UpdateGameError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: GameValidationError }
  | { kind: 'not_found' }
  | { kind: 'conflict' };

/**
 * NOTE: cover-image cleanup of the prior URL is intentionally NOT performed
 * here. A pre-commit delete races the transaction; a post-commit
 * `void storage.delete()` races a SIGTERM. The hourly `CleanupOrphans` cron
 * is the single source of truth — any storage file older than the safety
 * window whose URL no longer appears in `games.cover_image` is swept.
 */
export class UpdateGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly platformRepo: PlatformRepository,
    private readonly tx: TransactionRunner,
  ) {}

  async execute(
    externalId: string,
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

    const data = parsed.data;

    type TxResult = { ok: true; updated: Game } | { ok: false; error: UpdateGameError };

    let txOutcome: TxResult;
    try {
      txOutcome = await this.tx.run<TxResult>(async (tx) => {
        const repo = this.repo.withTx(tx);
        const platformRepo = this.platformRepo.withTx(tx);

        const existing = await repo.findByExternalId(userId, externalId);
        if (!existing) {
          return { ok: false, error: { kind: 'not_found' } };
        }

        // Platform validation runs AFTER the IDOR check so a cross-user
        // attempt yields `not_found` rather than leaking the platform list.
        const platform = await platformRepo.findByName(userId, data.platform);
        if (!platform) {
          return {
            ok: false,
            error: {
              kind: 'domain',
              error: { kind: 'platform_invalid', value: data.platform },
            },
          };
        }

        const props: GameUpdateProps =
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
                notes: data.notes ?? null,
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
                notes: data.notes ?? null,
              };

        const gameUpdateResult = GameUpdate.create(props);
        if (!gameUpdateResult.ok) {
          return { ok: false, error: { kind: 'domain', error: gameUpdateResult.error } };
        }

        const updated = await repo.update(
          userId,
          externalId,
          gameUpdateResult.value,
          existing.updatedAt,
        );
        if (!updated) {
          return { ok: false, error: { kind: 'not_found' } };
        }
        return { ok: true, updated };
      });
    } catch (e) {
      if (e instanceof OptimisticLockError) {
        return err({ kind: 'conflict' });
      }
      throw e;
    }

    if (!txOutcome.ok) return err(txOutcome.error);
    return ok(txOutcome.updated);
  }
}
