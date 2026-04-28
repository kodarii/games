import type { Platform } from '../../domain/platforms/platform';
import type { PlatformRepository } from '../../domain/platforms/platform-repository';

export class ListPlatforms {
  constructor(private readonly repo: PlatformRepository) {}

  async execute(userId: string): Promise<Platform[]> {
    return this.repo.list(userId);
  }
}
