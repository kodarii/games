import { describe, expect, it } from 'bun:test';
import { Game, type NewGame } from '../../domain/games/game';
import type { GameRepository } from '../../domain/games/game-repository';
import { CreateGame } from './create-game';

class FakeGameRepository implements GameRepository {
  list = async () => ({ items: [], total: 0 });
  findById = async () => null;
  delete = async () => null;
  update = async () => null;

  create = async (g: NewGame) => {
    return Game.fromPersistence({
      id: 1,
      title: g.title,
      developer: g.developer,
      genre: g.genre,
      releaseYear: g.releaseYear.value,
      platform: g.platform,
      edition: g.edition ?? null,
      hoursPlayed: g.hoursPlayed.value,
      status: g.status,
      format: g.format,
    });
  };
}

const validInput = {
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5' as const,
  edition: undefined,
  hoursPlayed: 120,
  status: 'Completed' as const,
  format: 'digital' as const,
};

describe('CreateGame', () => {
  it('creates game and returns ok', async () => {
    const useCase = new CreateGame(new FakeGameRepository());

    const result = await useCase.execute(validInput);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe('Elden Ring');
      expect(result.value.format).toBe('digital');
    }
  });

  it('accepts format physical and returns ok', async () => {
    const useCase = new CreateGame(new FakeGameRepository());

    const result = await useCase.execute({ ...validInput, format: 'physical' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('physical');
    }
  });

  it('defaults format to digital when omitted', async () => {
    const useCase = new CreateGame(new FakeGameRepository());
    const { format: _format, ...inputWithoutFormat } = validInput;

    const result = await useCase.execute(inputWithoutFormat);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.format).toBe('digital');
    }
  });

  it('returns invalid_input for invalid format', async () => {
    const useCase = new CreateGame(new FakeGameRepository());

    const result = await useCase.execute({ ...validInput, format: 'cartridge' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('invalid_input');
      if (result.error.kind === 'invalid_input') {
        expect(result.error.issues.some((i) => i.path[0] === 'format')).toBe(true);
      }
    }
  });
});
