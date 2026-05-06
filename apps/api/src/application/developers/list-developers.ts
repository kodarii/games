import type { Developer } from '../../domain/developers/developer';
import type { DeveloperRepository } from '../../domain/developers/developer-repository';

export class ListDevelopers {
  constructor(private readonly repo: DeveloperRepository) {}
  async execute(userId: string): Promise<Developer[]> {
    return this.repo.list(userId);
  }
}
