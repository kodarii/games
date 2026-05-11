import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

export type ProviderName = 'igdb';

export type ExternalMetadataRefError = { kind: 'provider_id_empty' };

export class ExternalMetadataRef {
  private constructor(
    public readonly providerName: ProviderName,
    public readonly providerId: string,
    public readonly matchedAt: Date,
  ) {}

  static create(props: {
    providerName: ProviderName;
    providerId: string;
    matchedAt: Date;
  }): Result<ExternalMetadataRef, ExternalMetadataRefError> {
    const trimmed = props.providerId.trim();
    if (trimmed.length === 0) {
      return err({ kind: 'provider_id_empty' });
    }
    return ok(new ExternalMetadataRef(props.providerName, trimmed, props.matchedAt));
  }

  static fromTrusted(props: {
    providerName: ProviderName;
    providerId: string;
    matchedAt: Date;
  }): ExternalMetadataRef {
    return new ExternalMetadataRef(props.providerName, props.providerId, props.matchedAt);
  }
}
