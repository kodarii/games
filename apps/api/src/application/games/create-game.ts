import { z } from 'zod';
import { type Game, type GameValidationError, createNewGame } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

const CreateGameInputSchema = z.object({
  title: z.string().min(1),
  developer: z.string().min(1),
  genre: z.string().optional().default(''),
  releaseYear: z.coerce.number().min(1970).max(2100),
  platform: z.enum(['PS3', 'PS4', 'PS5', 'PC', 'Xbox', 'Switch']),
  edition: z.string().optional().default(''),
  hoursPlayed: z.coerce.number().min(0).default(0),
  status: z.enum(['Playing', 'Completed', 'Backlog', 'Dropped', 'Wishlist']).default('Backlog'),
});

export type CreateGameInput = z.infer<typeof CreateGameInputSchema>;

export type CreateGameError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: GameValidationError };

export class CreateGame {
  constructor(private readonly repo: GameRepository) {}

  async execute(input: unknown): Promise<Result<Game, CreateGameError>> {
    const parsed = CreateGameInputSchema.safeParse(input);

    if (!parsed.success) {
      return err({ kind: 'invalid_input', issues: parsed.error.issues });
    }

    const data = parsed.data;

    const domainInput = {
      title: data.title,
      developer: data.developer,
      genre: data.genre,
      releaseYear: data.releaseYear,
      platform: data.platform,
      edition: data.edition || undefined,
      hoursPlayed: data.hoursPlayed,
      status: data.status,
    };

    const newGameResult = createNewGame(domainInput);

    if (!newGameResult.ok) {
      return err({ kind: 'domain', error: newGameResult.error });
    }

    const game = await this.repo.create(newGameResult.value);

    return ok(game);
  }
}
