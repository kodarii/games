import type { NewPlatform, Platform } from './platform';

export interface PlatformRepository {
  list(userId: string): Promise<Platform[]>;
  findById(id: number): Promise<Platform | null>;
  findByName(userId: string, name: string): Promise<Platform | null>;
  create(platform: NewPlatform): Promise<Platform>;
  delete(id: number): Promise<Platform | null>;
}
