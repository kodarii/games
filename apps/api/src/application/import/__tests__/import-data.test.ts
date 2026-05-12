import { describe, expect, it } from 'bun:test';
import type { ImportMode, ImportReport } from '@apex/shared';
import type { Game } from '../../../domain/games/game';
import type {
  GameRepository,
  ListGamesQuery,
  ListGamesResult,
} from '../../../domain/games/game-repository';
import type { GameUpdate } from '../../../domain/games/game-update';
import type { NewGame } from '../../../domain/games/new-game';
import type { ImportPlan, ImportRepository } from '../../../domain/import/import-repository';
import type { NewPlatform, Platform } from '../../../domain/platforms/platform';
import type { PlatformRepository } from '../../../domain/platforms/platform-repository';
import { ImportData } from '../import-data';

class FakeImportRepository implements ImportRepository {
  public lastCall: { userId: string; plan: ImportPlan; mode: ImportMode } | null = null;
  async apply(userId: string, plan: ImportPlan, mode: ImportMode): Promise<ImportReport> {
    this.lastCall = { userId, plan, mode };
    return {
      mode,
      platforms: { created: plan.platforms.length, updated: 0 },
      games: { created: plan.games.length, updated: 0 },
    };
  }
}

class FakePlatformRepository implements PlatformRepository {
  constructor(private readonly platforms: Platform[] = []) {}
  withTx(_tx: unknown): PlatformRepository {
    return this;
  }
  async list(_userId: string): Promise<Platform[]> {
    return this.platforms;
  }
  async findById(_id: number): Promise<Platform | null> {
    return null;
  }
  async findByName(_userId: string, _name: string): Promise<Platform | null> {
    return null;
  }
  async findByExternalId(_userId: string, _externalId: string): Promise<Platform | null> {
    return null;
  }
  async create(_platform: NewPlatform): Promise<Platform> {
    throw new Error('not implemented');
  }
  async delete(_id: number): Promise<Platform | null> {
    return null;
  }
}

class FakeGameRepository implements GameRepository {
  withTx(_tx: unknown): GameRepository {
    return this;
  }
  async list(_query: ListGamesQuery): Promise<ListGamesResult> {
    return { items: [], total: 0 };
  }
  async listAll(_userId: string): Promise<Game[]> {
    return [];
  }
  async findById(_id: number): Promise<Game | null> {
    return null;
  }
  async findByExternalId(_userId: string, _externalId: string): Promise<Game | null> {
    return null;
  }
  async create(_game: NewGame): Promise<Game> {
    throw new Error('not implemented');
  }
  async update(
    _userId: string,
    _externalId: string,
    _game: GameUpdate,
    _expectedUpdatedAt: Date,
  ): Promise<Game | null> {
    return null;
  }
  async delete(
    _userId: string,
    _externalId: string,
    _expectedUpdatedAt: Date,
  ): Promise<Game | null> {
    return null;
  }
  async countByPlatform(_userId: string, _platformName: string): Promise<number> {
    return 0;
  }
  async countByGenre(): Promise<number> {
    return 0;
  }
  async countByDeveloper(): Promise<number> {
    return 0;
  }
  async findAllCoverImages(): Promise<string[]> {
    return [];
  }
  async saveMetadata(): Promise<Game | null> {
    return null;
  }
}

function makeUseCase(
  opts: { platforms?: Platform[]; importRepo?: FakeImportRepository; idGen?: () => string } = {},
) {
  const importRepo = opts.importRepo ?? new FakeImportRepository();
  const uc = new ImportData(
    new FakeGameRepository(),
    new FakePlatformRepository(opts.platforms ?? []),
    importRepo,
    opts.idGen,
  );
  return { uc, importRepo: importRepo instanceof FakeImportRepository ? importRepo : null };
}

const snap2 = (overrides: object = {}) =>
  JSON.stringify({
    version: 2,
    exportedAt: '2024-01-01T00:00:00.000Z',
    platforms: [
      { externalId: 'p-1', name: 'PS5' },
      { externalId: 'p-2', name: 'Switch' },
    ],
    games: [
      {
        externalId: 'g-1',
        title: 'God of War',
        developer: 'Santa Monica',
        genre: 'Action',
        releaseYear: 2018,
        platform: 'PS5',
        hoursPlayed: 30,
        status: 'Completed',
        format: 'digital',
      },
      {
        externalId: 'g-2',
        title: 'Zelda',
        developer: 'Nintendo',
        genre: 'Adventure',
        releaseYear: 2017,
        platform: 'Switch',
        hoursPlayed: 80,
        status: 'Playing',
        format: 'digital',
      },
      {
        externalId: 'g-3',
        title: 'Mario',
        developer: 'Nintendo',
        genre: 'Platformer',
        releaseYear: 2017,
        platform: 'Switch',
        hoursPlayed: 20,
        status: 'Backlog',
        format: 'physical',
      },
    ],
    ...overrides,
  });

describe('ImportData.execute', () => {
  it('happy merge: calls apply with correct plan and mode', async () => {
    const importRepo = new FakeImportRepository();
    const uc = new ImportData(new FakeGameRepository(), new FakePlatformRepository(), importRepo);
    const result = await uc.execute('user-1', snap2(), 'merge');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe('merge');
      expect(result.value.platforms.created).toBe(2);
      expect(result.value.games.created).toBe(3);
    }
    expect(importRepo.lastCall?.userId).toBe('user-1');
    expect(importRepo.lastCall?.mode).toBe('merge');
    expect(importRepo.lastCall?.plan.platforms).toHaveLength(2);
    expect(importRepo.lastCall?.plan.games).toHaveLength(3);
  });

  it('happy replace: calls apply with mode=replace', async () => {
    const importRepo = new FakeImportRepository();
    const uc = new ImportData(new FakeGameRepository(), new FakePlatformRepository(), importRepo);
    const result = await uc.execute('user-1', snap2(), 'replace');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.mode).toBe('replace');
    expect(importRepo.lastCall?.mode).toBe('replace');
  });

  it('returns invalid_json for broken JSON', async () => {
    const importRepo = new FakeImportRepository();
    const uc = new ImportData(new FakeGameRepository(), new FakePlatformRepository(), importRepo);
    const result = await uc.execute('user-1', '{xxxxxx', 'merge');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_json');
    expect(importRepo.lastCall).toBeNull();
  });

  it('returns unsupported_version for version 5', async () => {
    const result = await makeUseCase().uc.execute(
      'user-1',
      JSON.stringify({ version: 5 }),
      'merge',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unsupported_version');
      if (result.error.kind === 'unsupported_version') expect(result.error.version).toBe(5);
    }
  });

  it('returns invalid_shape for v2 missing title', async () => {
    const bad = snap2({
      games: [
        {
          externalId: 'g-1',
          developer: 'X',
          genre: 'Y',
          releaseYear: 2020,
          platform: 'PS5',
          hoursPlayed: 0,
          status: 'Backlog',
          format: 'digital',
        },
      ],
    });
    const result = await makeUseCase().uc.execute('user-1', bad, 'merge');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_shape');
  });

  it('migrates v1 to v2: generated externalIds in plan', async () => {
    let n = 0;
    const gen = () => `gen-${++n}`;
    const v1 = JSON.stringify({
      version: 1,
      exportedAt: '2024-01-01T00:00:00.000Z',
      platforms: [{ name: 'PS5' }],
      games: [
        {
          title: 'Bloodborne',
          developer: 'FromSoftware',
          genre: 'Action RPG',
          releaseYear: 2015,
          platform: 'PS5',
          hoursPlayed: 50,
          status: 'Completed',
          format: 'physical',
        },
      ],
    });
    const importRepo = new FakeImportRepository();
    const uc = new ImportData(
      new FakeGameRepository(),
      new FakePlatformRepository(),
      importRepo,
      gen,
    );
    const result = await uc.execute('user-1', v1, 'merge');
    expect(result.ok).toBe(true);
    // platform gets gen-1, game gets gen-2
    expect(importRepo.lastCall?.plan.platforms[0]?.externalId).toBe('gen-1');
    expect(importRepo.lastCall?.plan.games[0]?.externalId).toBe('gen-2');
  });

  it('returns duplicate_external_id for platforms', async () => {
    const bad = snap2({
      platforms: [
        { externalId: 'dup-id', name: 'PS5' },
        { externalId: 'dup-id', name: 'Switch' },
      ],
    });
    const result = await makeUseCase().uc.execute('user-1', bad, 'merge');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('duplicate_external_id');
      if (result.error.kind === 'duplicate_external_id') {
        expect(result.error.scope).toBe('platforms');
        expect(result.error.externalId).toBe('dup-id');
        expect(result.error.indices).toEqual([0, 1]);
      }
    }
  });

  it('returns duplicate_external_id for games', async () => {
    const bad = snap2({
      games: [
        {
          externalId: 'dup-g',
          title: 'A',
          developer: 'X',
          genre: 'Y',
          releaseYear: 2020,
          platform: 'PS5',
          hoursPlayed: 0,
          status: 'Backlog',
          format: 'digital',
        },
        {
          externalId: 'dup-g',
          title: 'B',
          developer: 'X',
          genre: 'Y',
          releaseYear: 2020,
          platform: 'PS5',
          hoursPlayed: 0,
          status: 'Backlog',
          format: 'digital',
        },
      ],
    });
    const result = await makeUseCase().uc.execute('user-1', bad, 'merge');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('duplicate_external_id');
      if (result.error.kind === 'duplicate_external_id') expect(result.error.scope).toBe('games');
    }
  });

  it('returns duplicate_platform_name for duplicate platform names', async () => {
    const bad = snap2({
      platforms: [
        { externalId: 'p-1', name: 'PS5' },
        { externalId: 'p-2', name: 'PS5' },
      ],
    });
    const result = await makeUseCase().uc.execute('user-1', bad, 'merge');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('duplicate_platform_name');
      if (result.error.kind === 'duplicate_platform_name') {
        expect(result.error.name).toBe('PS5');
        expect(result.error.indices).toEqual([0, 1]);
      }
    }
  });

  it('merge: unknown platform in file but exists for user → ok', async () => {
    const { Platform: PlatformClass } = await import('../../../domain/platforms/platform');
    const existingPlatform = PlatformClass.fromPersistence({
      id: 1,
      externalId: 'ext-switch',
      userId: 'user-1',
      name: 'Switch',
    });
    const payload = snap2({
      platforms: [{ externalId: 'p-1', name: 'PS5' }],
      games: [
        {
          externalId: 'g-1',
          title: 'God of War',
          developer: 'Santa Monica',
          genre: 'Action',
          releaseYear: 2018,
          platform: 'PS5',
          hoursPlayed: 30,
          status: 'Completed',
          format: 'digital',
        },
        {
          externalId: 'g-2',
          title: 'Zelda',
          developer: 'Nintendo',
          genre: 'Adventure',
          releaseYear: 2017,
          platform: 'Switch',
          hoursPlayed: 80,
          status: 'Playing',
          format: 'digital',
        },
      ],
    });
    const importRepo = new FakeImportRepository();
    const uc = new ImportData(
      new FakeGameRepository(),
      new FakePlatformRepository([existingPlatform]),
      importRepo,
    );
    const result = await uc.execute('user-1', payload, 'merge');
    expect(result.ok).toBe(true);
  });

  it('merge: unknown platform not in file and not for user → error', async () => {
    const payload = snap2({
      platforms: [{ externalId: 'p-1', name: 'PS5' }],
      games: [
        {
          externalId: 'g-1',
          title: 'God of War',
          developer: 'Santa Monica',
          genre: 'Action',
          releaseYear: 2018,
          platform: 'PS5',
          hoursPlayed: 30,
          status: 'Completed',
          format: 'digital',
        },
        {
          externalId: 'g-2',
          title: 'Some Game',
          developer: 'Dev',
          genre: 'X',
          releaseYear: 2020,
          platform: 'Atari',
          hoursPlayed: 0,
          status: 'Backlog',
          format: 'digital',
        },
      ],
    });
    const result = await makeUseCase().uc.execute('user-1', payload, 'merge');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unknown_platform');
      if (result.error.kind === 'unknown_platform') {
        expect(result.error.platform).toBe('Atari');
        expect(result.error.gameIndices).toContain(1);
      }
    }
  });

  it('replace: unknown platform not in file even if user has it → error', async () => {
    const { Platform: PlatformClass } = await import('../../../domain/platforms/platform');
    const existingPlatform = PlatformClass.fromPersistence({
      id: 1,
      externalId: 'ext-switch',
      userId: 'user-1',
      name: 'Switch',
    });
    const payload = snap2({
      platforms: [{ externalId: 'p-1', name: 'PS5' }],
      games: [
        {
          externalId: 'g-1',
          title: 'God of War',
          developer: 'Santa Monica',
          genre: 'Action',
          releaseYear: 2018,
          platform: 'PS5',
          hoursPlayed: 30,
          status: 'Completed',
          format: 'digital',
        },
        {
          externalId: 'g-2',
          title: 'Zelda',
          developer: 'Nintendo',
          genre: 'Adventure',
          releaseYear: 2017,
          platform: 'Switch',
          hoursPlayed: 80,
          status: 'Playing',
          format: 'digital',
        },
      ],
    });
    // Pass existing platform but mode=replace → should still fail
    const importRepo = new FakeImportRepository();
    const uc = new ImportData(
      new FakeGameRepository(),
      new FakePlatformRepository([existingPlatform]),
      importRepo,
    );
    const result = await uc.execute('user-1', payload, 'replace');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('unknown_platform');
      if (result.error.kind === 'unknown_platform') expect(result.error.platform).toBe('Switch');
    }
  });

  it('imports external (no-version) format with synthesised platforms', async () => {
    let n = 0;
    const gen = () => `gen-${++n}`;
    const ext = JSON.stringify({
      games: [
        {
          title: 'Bloodborne',
          releaseYear: 2026,
          platform: 'PS4',
          format: 'physical',
          coverColor: '#f4a261',
        },
        { title: 'Mario', releaseYear: 2017, platform: 'Switch', format: 'digital' },
      ],
    });
    const importRepo = new FakeImportRepository();
    const uc = new ImportData(
      new FakeGameRepository(),
      new FakePlatformRepository(),
      importRepo,
      gen,
    );
    const result = await uc.execute('user-1', ext, 'merge');
    expect(result.ok).toBe(true);
    expect(importRepo.lastCall?.plan.platforms.map((p) => p.name)).toEqual(['PS4', 'Switch']);
    expect(importRepo.lastCall?.plan.games).toHaveLength(2);
    const bloodborne = importRepo.lastCall?.plan.games[0];
    expect(bloodborne).toBeDefined();
    if (bloodborne) {
      expect(bloodborne.title).toBe('Bloodborne');
      expect(bloodborne.developer).toBe('Unknown');
      expect(bloodborne.status).toBe('Backlog');
      expect(bloodborne.hoursPlayed?.value).toBe(0);
      expect(bloodborne.coverColor).toBe('#f4a261');
    }
  });

  it('external merge: reuses existing user platform externalId when name matches', async () => {
    const { Platform: PlatformClass } = await import('../../../domain/platforms/platform');
    const existing = PlatformClass.fromPersistence({
      id: 1,
      externalId: 'user-ps4',
      userId: 'user-1',
      name: 'PS4',
    });
    let n = 0;
    const gen = () => `gen-${++n}`;
    const ext = JSON.stringify({
      games: [{ title: 'Bloodborne', releaseYear: 2026, platform: 'PS4', format: 'physical' }],
    });
    const importRepo = new FakeImportRepository();
    const uc = new ImportData(
      new FakeGameRepository(),
      new FakePlatformRepository([existing]),
      importRepo,
      gen,
    );
    const result = await uc.execute('user-1', ext, 'merge');
    expect(result.ok).toBe(true);
    expect(importRepo.lastCall?.plan.platforms[0]?.externalId).toBe('user-ps4');
  });

  it('treats whitespace-only developer as null (developer is now nullable)', async () => {
    const snap = snap2({
      games: [
        {
          externalId: 'g-1',
          title: 'God of War',
          developer: '   ',
          genre: 'Action',
          releaseYear: 2018,
          platform: 'PS5',
          hoursPlayed: 30,
          status: 'Completed',
          format: 'digital',
        },
      ],
    });
    const result = await makeUseCase().uc.execute('user-1', snap, 'merge');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.games.created).toBe(1);
    }
  });
});
