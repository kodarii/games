import { z } from 'zod';
import { NewPlatform, type Platform, type PlatformValidationError } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';

const InputSchema = z.object({ name: z.string().min(1) });

export type CreatePlatformError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: PlatformValidationError }
  | { kind: 'name_taken' };

export class CreatePlatform {
  constructor(private readonly repo: PlatformRepository) {}

  async execute(input: unknown, userId: string): Promise<Result<Platform, CreatePlatformError>> {
    const parsed = InputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ kind: 'invalid_input', issues: parsed.error.issues });
    }

    const newP = NewPlatform.create({ userId, name: parsed.data.name });
    if (!newP.ok) {
      return err({ kind: 'domain', error: newP.error });
    }

    const existing = await this.repo.findByName(userId, newP.value.name);
    if (existing) {
      return err({ kind: 'name_taken' });
    }

    const created = await this.repo.create(newP.value);
    return ok(created);
  }
}
