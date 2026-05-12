import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type DictionaryNameError =
  | { kind: 'name_empty' }
  | { kind: 'name_too_long'; length: number };

/**
 * Reusable value object for short user-defined names in dictionary entities
 * (genres, developers, platforms, …). Trims input, rejects empty strings, and
 * caps the length at `maxLength`. Each dictionary picks its own max length —
 * pass it to `create`. `fromTrusted` skips validation; only call it on data
 * already persisted by us.
 */
export class DictionaryName {
  private constructor(public readonly value: string) {}

  static create(raw: string, maxLength: number): Result<DictionaryName, DictionaryNameError> {
    const trimmed = raw.trim();
    if (!trimmed) return err({ kind: 'name_empty' });
    if (trimmed.length > maxLength) return err({ kind: 'name_too_long', length: trimmed.length });
    return ok(new DictionaryName(trimmed));
  }

  static fromTrusted(value: string): DictionaryName {
    return new DictionaryName(value);
  }
}
