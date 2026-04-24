import { z } from 'zod';
import {
  type Game,
  type GameProps,
  type GameValidationError,
  NewGame,
} from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

const UpdateGameInputSchema = z.object({
  title: z.string().min(1),
  developer: z.string().min(1),
  genre: z.string().optional().default(''),
  releaseYear: z.coerce.number().min(1970).max(2100),
  platform: z.enum(['PS3', 'PS4', 'PS5', 'PC', 'Xbox', 'Switch']),
  edition: z.string().optional().default(''),
  hoursPlayed: z.coerce.number().min(0).default(0),
  status: z.enum(['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist']).default('Backlog'),
});

export type UpdateGameInput = z.infer<typeof UpdateGameInputSchema>;

export type UpdateGameError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: GameValidationError }
  | { kind: 'not_found' };

export class UpdateGame {
  constructor(private readonly repo: GameRepository) {}

  async execute(id: number, input: unknown): Promise<Result<Game, UpdateGameError>> {
    const parsed = UpdateGameInputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ kind: 'invalid_input', issues: parsed.error.issues });
    }

    const data = parsed.data;
    const props: GameProps = {
      title: data.title,
      developer: data.developer,
      genre: data.genre,
      releaseYear: data.releaseYear,
      platform: data.platform,
      edition: data.edition || undefined,
      hoursPlayed: data.hoursPlayed,
      status: data.status,
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
