import { z } from 'zod';
import {
  type Dictionary,
  type DictionaryKind,
  type DictionaryRepository,
  type DictionaryValidationError,
  NewDictionary,
} from '../../domain/dictionary/dictionary';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import type { TransactionRunner } from '../shared/transaction-runner';

const InputSchema = z.object({ name: z.string().min(1) });

export type CreateDictionaryError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'domain'; error: DictionaryValidationError }
  | { kind: 'name_taken' };

export type DeleteDictionaryError = { kind: 'not_found' } | { kind: 'in_use' };

/**
 * Callback the delete use-case uses to ask "is this entry still referenced by
 * any game?". Lives on `GameRepository.countByX` for each dictionary kind;
 * the factory takes a bound function so the use-case stays decoupled from
 * the game aggregate.
 */
export type DictionaryUsageCounter = (userId: string, name: string) => Promise<number>;

export interface ListDictionaryUseCase<TKind extends DictionaryKind> {
  execute(userId: string): Promise<Dictionary<TKind>[]>;
}

export interface CreateDictionaryUseCase<TKind extends DictionaryKind> {
  execute(
    input: unknown,
    userId: string,
  ): Promise<Result<Dictionary<TKind>, CreateDictionaryError>>;
}

export interface DeleteDictionaryUseCase<TKind extends DictionaryKind> {
  execute(id: number, userId: string): Promise<Result<Dictionary<TKind>, DeleteDictionaryError>>;
}

export interface DictionaryUseCases<TKind extends DictionaryKind> {
  list: ListDictionaryUseCase<TKind>;
  create: CreateDictionaryUseCase<TKind>;
  delete: DeleteDictionaryUseCase<TKind>;
}

export interface MakeDictionaryUseCasesDeps<TKind extends DictionaryKind> {
  repo: DictionaryRepository<TKind>;
  /**
   * Returns a transaction-bound usage counter so the delete use-case can run
   * the count and the delete in a single transaction. Wraps
   * `gameRepository.withTx(tx).countByX(userId, name)`.
   */
  withCounterTx: (tx: unknown) => DictionaryUsageCounter;
  transactionRunner: TransactionRunner;
  kind: TKind;
  /** Per-dictionary name length cap (genres/platforms = 40, developers = 60). */
  maxNameLength: number;
}

export function makeDictionaryUseCases<TKind extends DictionaryKind>(
  deps: MakeDictionaryUseCasesDeps<TKind>,
): DictionaryUseCases<TKind> {
  const { repo, withCounterTx, transactionRunner, kind, maxNameLength } = deps;

  return {
    list: {
      execute: (userId) => repo.list(userId),
    },
    create: {
      async execute(input, userId) {
        const parsed = InputSchema.safeParse(input);
        if (!parsed.success) return err({ kind: 'invalid_input', issues: parsed.error.issues });

        const newEntry = NewDictionary.create(
          { userId, name: parsed.data.name },
          kind,
          maxNameLength,
        );
        if (!newEntry.ok) return err({ kind: 'domain', error: newEntry.error });

        const existing = await repo.findByName(userId, newEntry.value.name);
        if (existing) return err({ kind: 'name_taken' });

        return ok(await repo.create(newEntry.value));
      },
    },
    delete: {
      async execute(id, userId) {
        return transactionRunner.run<Result<Dictionary<TKind>, DeleteDictionaryError>>(
          async (tx) => {
            const txRepo = repo.withTx(tx);
            const txCount = withCounterTx(tx);

            const existing = await txRepo.findById(id);
            if (!existing || existing.userId !== userId) return err({ kind: 'not_found' });

            const inUse = await txCount(userId, existing.name);
            if (inUse > 0) return err({ kind: 'in_use' });

            const deleted = await txRepo.delete(id);
            if (!deleted) return err({ kind: 'not_found' });

            return ok(deleted);
          },
        );
      },
    },
  };
}
