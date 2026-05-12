import { err, ok } from '../shared/result';
import type { Result } from '../shared/result';

/**
 * Brand on `string` so the domain can hand-off a ProviderName without knowing
 * which providers a deployment supports. Validation of the concrete name
 * (against `SUPPORTED_PROVIDERS`) lives in the application layer, where the
 * Zod boundary schema runs.
 */
export type ProviderName = string & { readonly __brand: 'ProviderName' };

export type ExternalMetadataRefError =
  | { kind: 'provider_id_empty' }
  | { kind: 'provider_name_empty' };

export class ExternalMetadataRef {
  private constructor(
    public readonly providerName: ProviderName,
    public readonly providerId: string,
    public readonly matchedAt: Date,
  ) {}

  static create(props: {
    providerName: string;
    providerId: string;
    matchedAt: Date;
  }): Result<ExternalMetadataRef, ExternalMetadataRefError> {
    const trimmedName = props.providerName.trim();
    if (trimmedName.length === 0) {
      return err({ kind: 'provider_name_empty' });
    }
    const trimmed = props.providerId.trim();
    if (trimmed.length === 0) {
      return err({ kind: 'provider_id_empty' });
    }
    return ok(new ExternalMetadataRef(trimmedName as ProviderName, trimmed, props.matchedAt));
  }

  static fromTrusted(props: {
    providerName: string;
    providerId: string;
    matchedAt: Date;
  }): ExternalMetadataRef {
    return new ExternalMetadataRef(
      props.providerName as ProviderName,
      props.providerId,
      props.matchedAt,
    );
  }
}
