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

const UpdateGameInputSchema = z.object({
  title: z.string().min(1),
  developer: z.string().min(1),
  genre: z.string().optional().default(''),
  releaseYear: z.coerce.number().min(1970).max(2100),
  platform: z.string().min(1),
  edition: z.string().optional().default(''),
  hoursPlayed: z.coerce.number().min(0).default(0),
  status: z.enum(['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist']).default('Backlog'),
  format: z.enum(['physical', 'digital']).default('digital'),
  coverColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

export type UpdateGameInput = z.infer<typeof UpdateGameInputSchema>;

export type UpdateGameError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: GameValidationError }
  | { kind: 'not_found' };

export class UpdateGame {
  constructor(
    private readonly repo: GameRepository,
    private readonly platformRepo: PlatformRepository,
  ) {}

  async execute(id: number, input: unknown, userId: string): Promise<Result<Game, UpdateGameError>> {
    const parsed = UpdateGameInputSchema.safeParse(input);
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
      return err({ kind: 'domain', error: { kind: 'platform_invalid', value: data.platform } });
    }

    const props: GameProps = {
      userId: existing.userId,
      title: data.title,
      developer: data.developer,
      genre: data.genre,
      releaseYear: data.releaseYear,
      platform: data.platform,
      edition: data.edition || undefined,
      hoursPlayed: data.hoursPlayed,
      status: data.status,
      format: data.format,
      coverColor: data.coverColor,
    };

    const gameUpdateResult = NewGame.create(props);
    if (!gameUpdateResult.ok) {
      return err({ kind: 'domain', error: gameUpdateResult.error });
    }

    const updated = await this.repo.update(id, gameUpdateResult.value);
    if (!updated) {
      return err({ kind: 'not_found' });
    }

    return ok(updated);
  }
}
