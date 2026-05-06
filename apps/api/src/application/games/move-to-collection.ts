import type { Game, GameValidationError } from '../../domain/games/game';
import { NewGame } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { err, ok, type Result } from '../../domain/shared/result';

export type MoveToCollectionError =
  | { kind: 'not_found' }
  | { kind: 'already_owned' }
  | { kind: 'domain'; error: GameValidationError };

export class MoveToCollection {
  constructor(private readonly repo: GameRepository) {}

  async execute(externalId: string, userId: string): Promise<Result<Game, MoveToCollectionError>> {
    const existing = await this.repo.findByExternalId(userId, externalId);
    if (!existing) return err({ kind: 'not_found' });
    if (existing.kind === 'owned') return err({ kind: 'already_owned' });

    const newGameResult = NewGame.create({
      userId: existing.userId,
      kind: 'owned',
      title: existing.title,
      developer: existing.developer,
      genre: existing.genre,
      releaseYear: existing.releaseYear?.value,
      platform: existing.platform,
      edition: existing.edition,
      hoursPlayed: 0,
      status: 'Backlog',
      format: existing.format,
      coverColor: existing.coverColor,
      coverImage: existing.coverImage,
      price: existing.price?.value,
      purchasedAt: undefined,
    });
    if (!newGameResult.ok) return err({ kind: 'domain', error: newGameResult.error });

    const updated = await this.repo.update(existing.id, newGameResult.value);
    if (!updated) return err({ kind: 'not_found' });
    return ok(updated);
  }
}
