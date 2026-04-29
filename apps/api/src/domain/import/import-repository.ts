import type { ImportMode, ImportReport } from '@apex/shared';
import type { NewGame } from '../games/game';
import type { NewPlatform } from '../platforms/platform';

export interface ImportPlan {
  platforms: NewPlatform[];
  games: NewGame[];
}

export interface ImportRepository {
  apply(userId: string, plan: ImportPlan, mode: ImportMode): Promise<ImportReport>;
}
