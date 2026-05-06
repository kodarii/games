import { z } from 'zod';
import { NewGenre, type Genre, type GenreValidationError } from '../../domain/genres/genre';
import type { GenreRepository } from '../../domain/genres/genre-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

const InputSchema = z.object({ name: z.string().min(1) });

export type CreateGenreError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: GenreValidationError }
  | { kind: 'name_taken' };

export class CreateGenre {
  constructor(private readonly repo: GenreRepository) {}

  async execute(input: unknown, userId: string): Promise<Result<Genre, CreateGenreError>> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err({ kind: 'invalid_input', issues: parsed.error.issues });

    const newG = NewGenre.create({ userId, name: parsed.data.name });
    if (!newG.ok) return err({ kind: 'domain', error: newG.error });

    const existing = await this.repo.findByName(userId, newG.value.name);
    if (existing) return err({ kind: 'name_taken' });

    return ok(await this.repo.create(newG.value));
  }
}
