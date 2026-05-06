import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type DeveloperValidationError =
  | { kind: 'missing_user_id' }
  | { kind: 'name_empty' }
  | { kind: 'name_too_long'; length: number };

export type DeveloperProps = { userId: string; name: string };

export class DeveloperName {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<DeveloperName, DeveloperValidationError> {
    const trimmed = raw.trim();
    if (!trimmed) return err({ kind: 'name_empty' });
    if (trimmed.length > 60) return err({ kind: 'name_too_long', length: trimmed.length });
    return ok(new DeveloperName(trimmed));
  }

  static fromTrusted(value: string): DeveloperName {
    return new DeveloperName(value);
  }
}

export class NewDeveloper {
  private constructor(
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _name: DeveloperName,
  ) {}

  static create(
    props: DeveloperProps,
    idGenerator: () => string = () => crypto.randomUUID(),
  ): Result<NewDeveloper, DeveloperValidationError> {
    if (!props.userId?.trim()) return err({ kind: 'missing_user_id' });
    const nameResult = DeveloperName.create(props.name);
    if (!nameResult.ok) return nameResult;
    return ok(new NewDeveloper(idGenerator(), props.userId.trim(), nameResult.value));
  }

  get externalId(): string { return this._externalId; }
  get userId(): string { return this._userId; }
  get name(): string { return this._name.value; }
}

export class Developer {
  private constructor(
    private readonly _id: number,
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _name: DeveloperName,
  ) {}

  static fromPersistence(row: { id: number; externalId: string; userId: string; name: string }): Developer {
    return new Developer(row.id, row.externalId, row.userId, DeveloperName.fromTrusted(row.name));
  }

  get id(): number { return this._id; }
  get externalId(): string { return this._externalId; }
  get userId(): string { return this._userId; }
  get name(): string { return this._name.value; }

  toJSON() {
    return { id: this._id, externalId: this._externalId, userId: this._userId, name: this._name.value };
  }
}
