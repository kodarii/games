import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { DictionaryName, type DictionaryNameError } from './dictionary-name';

/**
 * Phantom type that distinguishes one dictionary kind (e.g. `'genre'`) from
 * another at the type level. The runtime values are interchangeable; the type
 * tag prevents accidentally passing a `Genre` where a `Platform` is expected.
 */
export type DictionaryKind = string;

export type DictionaryValidationError = { kind: 'missing_user_id' } | DictionaryNameError;

export interface DictionaryProps {
  userId: string;
  name: string;
}

/**
 * Generic "ready-to-insert" dictionary entry. Carries the kind tag so the type
 * system can tell `NewDictionary<'genre'>` apart from `NewDictionary<'platform'>`.
 */
export class NewDictionary<TKind extends DictionaryKind> {
  // The phantom field exists only at the type level via TS narrowing on
  // `kind`; we keep an actual property so structural typing cannot collapse
  // two different kinds together.
  private constructor(
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _name: DictionaryName,
    public readonly kind: TKind,
  ) {}

  static create<TKind extends DictionaryKind>(
    props: DictionaryProps,
    kind: TKind,
    maxNameLength: number,
    idGenerator: () => string = () => crypto.randomUUID(),
  ): Result<NewDictionary<TKind>, DictionaryValidationError> {
    if (!props.userId || !props.userId.trim()) {
      return err({ kind: 'missing_user_id' });
    }
    const nameResult = DictionaryName.create(props.name, maxNameLength);
    if (!nameResult.ok) return nameResult;

    return ok(new NewDictionary(idGenerator(), props.userId.trim(), nameResult.value, kind));
  }

  get externalId(): string {
    return this._externalId;
  }
  get userId(): string {
    return this._userId;
  }
  get name(): string {
    return this._name.value;
  }
}

export interface DictionaryRow {
  id: number;
  externalId: string;
  userId: string;
  name: string;
}

/**
 * Generic persistence-shaped dictionary entry. `toJSON` keeps the existing
 * client contract intact; `kind` is type-only and not serialized.
 */
export class Dictionary<TKind extends DictionaryKind> {
  private constructor(
    private readonly _id: number,
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _name: DictionaryName,
    public readonly kind: TKind,
  ) {}

  static fromPersistence<TKind extends DictionaryKind>(
    row: DictionaryRow,
    kind: TKind,
  ): Dictionary<TKind> {
    return new Dictionary(
      row.id,
      row.externalId,
      row.userId,
      DictionaryName.fromTrusted(row.name),
      kind,
    );
  }

  get id(): number {
    return this._id;
  }
  get externalId(): string {
    return this._externalId;
  }
  get userId(): string {
    return this._userId;
  }
  get name(): string {
    return this._name.value;
  }

  toJSON() {
    return {
      id: this._id,
      externalId: this._externalId,
      userId: this._userId,
      name: this._name.value,
    };
  }
}

/**
 * Repository contract for any dictionary kind. Concrete implementations
 * supply the Drizzle table reference and the kind tag.
 */
export interface DictionaryRepository<TKind extends DictionaryKind> {
  withTx(tx: unknown): DictionaryRepository<TKind>;
  list(userId: string): Promise<Dictionary<TKind>[]>;
  findById(id: number): Promise<Dictionary<TKind> | null>;
  findByName(userId: string, name: string): Promise<Dictionary<TKind> | null>;
  create(entry: NewDictionary<TKind>): Promise<Dictionary<TKind>>;
  delete(id: number): Promise<Dictionary<TKind> | null>;
}

// Re-export helpers so callers only need this file.
export { ok, err };
export type { Result };
