import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type GenreValidationError =
  | { kind: 'missing_user_id' }
  | { kind: 'name_empty' }
  | { kind: 'name_too_long'; length: number };

export type GenreProps = { userId: string; name: string };

export class GenreName {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<GenreName, GenreValidationError> {
    const trimmed = raw.trim();
    if (!trimmed) return err({ kind: 'name_empty' });
    if (trimmed.length > 40) return err({ kind: 'name_too_long', length: trimmed.length });
    return ok(new GenreName(trimmed));
  }

  static fromTrusted(value: string): GenreName {
    return new GenreName(value);
  }
}

export class NewGenre {
  private constructor(
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _name: GenreName,
  ) {}

  static create(
    props: GenreProps,
    idGenerator: () => string = () => crypto.randomUUID(),
  ): Result<NewGenre, GenreValidationError> {
    if (!props.userId?.trim()) return err({ kind: 'missing_user_id' });
    const nameResult = GenreName.create(props.name);
    if (!nameResult.ok) return nameResult;
    return ok(new NewGenre(idGenerator(), props.userId.trim(), nameResult.value));
  }

  get externalId(): string { return this._externalId; }
  get userId(): string { return this._userId; }
  get name(): string { return this._name.value; }
}

export class Genre {
  private constructor(
    private readonly _id: number,
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _name: GenreName,
  ) {}

  static fromPersistence(row: { id: number; externalId: string; userId: string; name: string }): Genre {
    return new Genre(row.id, row.externalId, row.userId, GenreName.fromTrusted(row.name));
  }

  get id(): number { return this._id; }
  get externalId(): string { return this._externalId; }
  get userId(): string { return this._userId; }
  get name(): string { return this._name.value; }

  toJSON() {
    return { id: this._id, externalId: this._externalId, userId: this._userId, name: this._name.value };
  }
}
