import type { IntegrationCredentialsRepository } from '../../domain/integrations/integration-credentials-repository';
import {
  type IgdbIntegrationStatusResponse,
  toIgdbIntegrationStatus,
} from './igdb-integration-status-dto';

/**
 * Read-side use case for `GET /api/integrations/igdb`.
 *
 * Owns the repo lookup and DTO mapping so the route handler never reaches
 * past the application layer. Lookup is per-user (avoids the IGDB-trap of
 * exposing globally-keyed integration rows).
 */
export class GetIgdbIntegrationStatus {
  constructor(private readonly repo: IntegrationCredentialsRepository) {}

  async execute(userId: string): Promise<IgdbIntegrationStatusResponse> {
    const row = await this.repo.findByUserAndKind(userId, 'igdb');
    return toIgdbIntegrationStatus(row);
  }
}
