import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type PlatformValidationError =
  | { kind: 'missing_user_id' }
  | { kind: 'name_empty' }
  | { kind: 'name_too_long'; length: number };

export type PlatformProps = { userId: string; name: string };

export class PlatformName {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<PlatformName, PlatformValidationError> {
    const trimmed = raw.trim();
    if (!trimmed) {
      return err({ kind: 'name_empty' });
    }
    if (trimmed.length > 40) {
      return err({ kind: 'name_too_long', length: trimmed.length });
    }
    return ok(new PlatformName(trimmed));
  }

  static fromTrusted(value: string): PlatformName {
    return new PlatformName(value);
  }
}

export class NewPlatform {
  private constructor(
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _name: PlatformName,
  ) {}

  static create(
    props: PlatformProps,
    idGenerator: () => string = () => crypto.randomUUID(),
  ): Result<NewPlatform, PlatformValidationError> {
    if (!props.userId || !props.userId.trim()) {
      return err({ kind: 'missing_user_id' });
    }

    const nameResult = PlatformName.create(props.name);
    if (!nameResult.ok) {
      return nameResult;
    }

    const externalId = idGenerator();
    return ok(new NewPlatform(externalId, props.userId.trim(), nameResult.value));
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

export class Platform {
  private constructor(
    private readonly _id: number,
    private readonly _externalId: string,
    private readonly _userId: string,
    private readonly _name: PlatformName,
  ) {}

  static fromPersistence(row: { id: number; externalId: string; userId: string; name: string }): Platform {
    if (!row.externalId) {
      throw new Error(`Platform row ${row.id} has null externalId — run backfill first`);
    }
    return new Platform(row.id, row.externalId, row.userId, PlatformName.fromTrusted(row.name));
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
