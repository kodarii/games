import type { CoverStorage } from './application/cover-storage/cover-storage';
import { CreateGame } from './application/games/create-game';
import { DeleteGame } from './application/games/delete-game';
import { GetGame } from './application/games/get-game';
import { ListGames } from './application/games/list-games';
import { MoveToCollection } from './application/games/move-to-collection';
import { UpdateGame } from './application/games/update-game';
import { UploadThingCoverStorage } from './infrastructure/cover-storage/uploadthing-cover-storage';
import { DrizzleGameRepository } from './infrastructure/games/drizzle-game-repository';
import { DrizzlePlatformRepository } from './infrastructure/platforms/drizzle-platform-repository';

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
export const platformRepository = new DrizzlePlatformRepository();

export const createGame = new CreateGame(gameRepository, platformRepository);
export const updateGame = new UpdateGame(gameRepository, platformRepository, coverStorage);
export const deleteGame = new DeleteGame(gameRepository, coverStorage);
export const listGames = new ListGames(gameRepository);
export const getGame = new GetGame(gameRepository);
export const moveToCollection = new MoveToCollection(gameRepository);
