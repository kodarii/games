import { z } from 'zod';
import type { IgdbCredentialsVerifier } from '../../domain/integrations/igdb-credentials-verifier';
import type { IntegrationCipher } from '../../domain/integrations/integration-cipher';
import type { IntegrationCredentials } from '../../domain/integrations/integration-credentials';
import type { IntegrationCredentialsRepository } from '../../domain/integrations/integration-credentials-repository';
import {
  ClientId,
  type IntegrationKind,
} from '../../domain/integrations/integration-value-objects';
import { NewIntegrationCredentials } from '../../domain/integrations/new-integration-credentials';
import { err, ok } from '../../domain/shared/result';
import type { Result } from '../../domain/shared/result';
import type { IgdbResourceCacheInvalidator } from './igdb-resource-cache-invalidator';

const IGDB_KIND: IntegrationKind = 'igdb';

const inputSchema = z.object({
  clientId: z.string().trim().min(1),
  // `null` (or empty after coercion) means "keep the existing secret".
  clientSecret: z
    .string()
    .nullable()
    .transform((s) => {
      if (s === null) return null;
      const trimmed = s.trim();
      return trimmed.length === 0 ? null : trimmed;
    }),
  enabled: z.boolean(),
});

export type SaveIgdbIntegrationInput = z.input<typeof inputSchema>;

export type SaveIgdbIntegrationError =
  | { kind: 'invalid_input'; issues: z.ZodIssue[] }
  | { kind: 'invalid_credentials'; reason: 'client_id' | 'client_secret' | 'unknown' }
  | { kind: 'twitch_unavailable'; status: number }
  | { kind: 'network_unreachable'; reason: 'timeout' | 'fetch_failed' }
  | { kind: 'storage_corrupt' };

export interface SaveIgdbIntegrationDeps {
  readonly repo: IntegrationCredentialsRepository;
  readonly cipher: IntegrationCipher;
  readonly verifier: IgdbCredentialsVerifier;
  readonly resourceCache: IgdbResourceCacheInvalidator;
  readonly now: () => Date;
  readonly uuid: () => string;
}

/**
 * Saves (creates or updates) the per-user IGDB integration credentials.
 *
 * Flow:
 *   1. Validate input.
 *   2. Resolve the plaintext secret — either the new one from the input, or
 *      the existing ciphertext decrypted via the cipher port (so the user can
 *      re-verify without re-typing the secret).
 *   3. Verify against Twitch.
 *   4. Encrypt the secret and persist the aggregate.
 *   5. After the row is persisted, drop the cached per-user IGDB resources so
 *      the next request rebuilds from the freshly persisted credentials.
 *
 * The first verified save auto-enables the row regardless of `input.enabled`:
 * a fresh integration that just passed verification is the user's clearest
 * "turn it on" signal. Subsequent saves honour `input.enabled` exactly.
 */
export class SaveIgdbIntegration {
  constructor(private readonly deps: SaveIgdbIntegrationDeps) {}

  async execute(
    input: unknown,
    userId: string,
  ): Promise<Result<{ creds: IntegrationCredentials }, SaveIgdbIntegrationError>> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      return err({ kind: 'invalid_input', issues: parsed.error.issues });
    }
    const data = parsed.data;

    const existing = await this.deps.repo.findByUserAndKind(userId, IGDB_KIND);

    // Step 2: resolve plaintext secret.
    let plaintext: string;
    if (data.clientSecret !== null) {
      plaintext = data.clientSecret;
    } else if (existing !== null) {
      const decrypted = this.deps.cipher.decrypt(existing.clientSecretCiphertext);
      if (!decrypted.ok) {
        return err({ kind: 'storage_corrupt' });
      }
      plaintext = decrypted.value;
    } else {
      return err({
        kind: 'invalid_input',
        issues: [
          {
            code: 'custom',
            message: 'clientSecret is required when no integration credentials exist yet',
            path: ['clientSecret'],
          } as z.ZodIssue,
        ],
      });
    }

    // Step 3: verify with Twitch.
    const verifyResult = await this.deps.verifier.verify({
      clientId: data.clientId,
      clientSecret: plaintext,
    });
    if (!verifyResult.ok) {
      return err(verifyResult.error);
    }

    // Step 4: encrypt and build aggregate.
    const ciphertext = this.deps.cipher.encrypt(plaintext);
    const now = this.deps.now();

    // First verified save (no existing row, OR existing row never verified)
    // auto-enables. Subsequent saves honour input.enabled exactly.
    const isFirstVerified = existing === null || existing.lastVerifiedAt === null;
    const effectiveEnabled = isFirstVerified ? true : data.enabled;

    let aggregate: IntegrationCredentials;
    if (existing === null) {
      const newClientIdResult = ClientId.create(data.clientId);
      if (!newClientIdResult.ok) {
        return err({
          kind: 'invalid_input',
          issues: [
            {
              code: 'custom',
              message: `clientId ${newClientIdResult.error.reason}`,
              path: ['clientId'],
            } as z.ZodIssue,
          ],
        });
      }
      const created = NewIntegrationCredentials.create({
        id: this.deps.uuid(),
        userId,
        integration: IGDB_KIND,
        clientId: data.clientId,
        clientSecretCiphertext: ciphertext,
        now,
      });
      if (!created.ok) {
        return err({
          kind: 'invalid_input',
          issues: [
            {
              code: 'custom',
              message: `clientId ${created.error.reason}`,
              path: ['clientId'],
            } as z.ZodIssue,
          ],
        });
      }
      aggregate = created.value;
      if (effectiveEnabled) aggregate = aggregate.enable();
      aggregate = aggregate.markVerified(now);
    } else {
      aggregate = existing;
      if (existing.clientId.value !== data.clientId) {
        const newClientIdResult = ClientId.create(data.clientId);
        if (!newClientIdResult.ok) {
          return err({
            kind: 'invalid_input',
            issues: [
              {
                code: 'custom',
                message: `clientId ${newClientIdResult.error.reason}`,
                path: ['clientId'],
              } as z.ZodIssue,
            ],
          });
        }
        aggregate = aggregate.replaceClientId(newClientIdResult.value);
      }
      aggregate = aggregate.replaceSecret(ciphertext);
      aggregate = effectiveEnabled ? aggregate.enable() : aggregate.disable();
      aggregate = aggregate.markVerified(now);
    }

    await this.deps.repo.save(aggregate);
    this.deps.resourceCache.invalidate(userId);
    return ok({ creds: aggregate });
  }
}
