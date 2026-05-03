import type { CoverStorage } from './application/cover-storage/cover-storage';
import { UploadThingCoverStorage } from './infrastructure/cover-storage/uploadthing-cover-storage';
import { DrizzleGameRepository } from './infrastructure/games/drizzle-game-repository';

const uploadThingToken = process.env.UPLOADTHING_TOKEN ?? '';
export const coverStorageAvailable = uploadThingToken.length > 0;

class NullCoverStorage implements CoverStorage {
  async upload(_file: File): Promise<{ url: string }> {
    throw new Error('Cover storage is not configured');
  }
  async delete(_url: string): Promise<void> {}
  async listOlderThan(_olderThanHours: number): Promise<string[]> {
    return [];
  }
}

export const coverStorage: CoverStorage = coverStorageAvailable
  ? new UploadThingCoverStorage(uploadThingToken)
  : new NullCoverStorage();

export const gameRepository = new DrizzleGameRepository();
