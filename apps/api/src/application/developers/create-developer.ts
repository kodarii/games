import { z } from 'zod';
import { NewDeveloper, type Developer, type DeveloperValidationError } from '../../domain/developers/developer';
import type { DeveloperRepository } from '../../domain/developers/developer-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

const InputSchema = z.object({ name: z.string().min(1) });

export type CreateDeveloperError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: DeveloperValidationError }
  | { kind: 'name_taken' };

export class CreateDeveloper {
  constructor(private readonly repo: DeveloperRepository) {}

  async execute(input: unknown, userId: string): Promise<Result<Developer, CreateDeveloperError>> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) return err({ kind: 'invalid_input', issues: parsed.error.issues });

    const newD = NewDeveloper.create({ userId, name: parsed.data.name });
    if (!newD.ok) return err({ kind: 'domain', error: newD.error });

    const existing = await this.repo.findByName(userId, newD.value.name);
    if (existing) return err({ kind: 'name_taken' });

    return ok(await this.repo.create(newD.value));
  }
}
