import { Hono } from 'hono';

export type GameStatus = 'Playing' | 'Completed' | 'Backlog' | 'Dropped' | 'Wishlist';
export type GamePlatform = 'PS3' | 'PS4' | 'PS5' | 'PC' | 'Xbox' | 'Switch';

export interface Game {
  id: number;
  title: string;
  developer: string;
  genre: string;
  releaseYear: number;
  platform: GamePlatform;
  edition?: string;
  hoursPlayed: number;
  status: GameStatus;
}

const GAMES: Game[] = [
  {
    id: 1,
    title: 'The Last of Us Part II',
    developer: 'Naughty Dog',
    genre: 'Action-Adventure',
    releaseYear: 2020,
    platform: 'PS4',
    edition: 'Remastered',
    hoursPlayed: 42,
    status: 'Completed',
  },
  {
    id: 2,
    title: 'God of War Ragnarök',
    developer: 'Santa Monica Studio',
    genre: 'Action-Adventure',
    releaseYear: 2022,
    platform: 'PS5',
    hoursPlayed: 68,
    status: 'Playing',
  },
  {
    id: 3,
    title: 'Bloodborne',
    developer: 'FromSoftware',
    genre: 'Action RPG',
    releaseYear: 2015,
    platform: 'PS4',
    hoursPlayed: 95,
    status: 'Completed',
  },
  {
    id: 4,
    title: 'Horizon Forbidden West',
    developer: 'Guerrilla Games',
    genre: 'Open World',
    releaseYear: 2022,
    platform: 'PS5',
    edition: 'Complete Edition',
    hoursPlayed: 52,
    status: 'Playing',
  },
  {
    id: 5,
    title: 'Elden Ring',
    developer: 'FromSoftware',
    genre: 'Action RPG',
    releaseYear: 2022,
    platform: 'PS5',
    hoursPlayed: 120,
    status: 'Completed',
  },
  {
    id: 6,
    title: 'Final Fantasy VII Rebirth',
    developer: 'Square Enix',
    genre: 'JRPG',
    releaseYear: 2024,
    platform: 'PS5',
    hoursPlayed: 8,
    status: 'Playing',
  },
  {
    id: 7,
    title: 'Ghost of Tsushima',
    developer: 'Sucker Punch',
    genre: 'Action-Adventure',
    releaseYear: 2020,
    platform: 'PS4',
    edition: "Director's Cut",
    hoursPlayed: 55,
    status: 'Completed',
  },
  {
    id: 8,
    title: 'Persona 5 Royal',
    developer: 'Atlus',
    genre: 'JRPG',
    releaseYear: 2020,
    platform: 'PS4',
    hoursPlayed: 103,
    status: 'Completed',
  },
  {
    id: 9,
    title: 'Uncharted 4',
    developer: 'Naughty Dog',
    genre: 'Action-Adventure',
    releaseYear: 2016,
    platform: 'PS4',
    hoursPlayed: 18,
    status: 'Completed',
  },
  {
    id: 10,
    title: 'Spider-Man 2',
    developer: 'Insomniac Games',
    genre: 'Open World',
    releaseYear: 2023,
    platform: 'PS5',
    hoursPlayed: 0,
    status: 'Backlog',
  },
  {
    id: 11,
    title: "Demon's Souls",
    developer: 'Bluepoint Games',
    genre: 'Action RPG',
    releaseYear: 2020,
    platform: 'PS5',
    hoursPlayed: 0,
    status: 'Wishlist',
  },
  {
    id: 12,
    title: 'Death Stranding',
    developer: 'Kojima Productions',
    genre: 'Action',
    releaseYear: 2019,
    platform: 'PS4',
    edition: "Director's Cut",
    hoursPlayed: 11,
    status: 'Dropped',
  },
  {
    id: 13,
    title: 'Returnal',
    developer: 'Housemarque',
    genre: 'Roguelike',
    releaseYear: 2021,
    platform: 'PS5',
    hoursPlayed: 24,
    status: 'Playing',
  },
  {
    id: 14,
    title: 'Ratchet & Clank: Rift Apart',
    developer: 'Insomniac Games',
    genre: 'Platformer',
    releaseYear: 2021,
    platform: 'PS5',
    hoursPlayed: 15,
    status: 'Completed',
  },
  {
    id: 15,
    title: 'Metal Gear Solid 4',
    developer: 'Kojima Productions',
    genre: 'Stealth Action',
    releaseYear: 2008,
    platform: 'PS3',
    hoursPlayed: 22,
    status: 'Completed',
  },
  {
    id: 16,
    title: 'Gran Turismo 7',
    developer: 'Polyphony Digital',
    genre: 'Racing',
    releaseYear: 2022,
    platform: 'PS5',
    hoursPlayed: 33,
    status: 'Playing',
  },
];

type SortField = 'title' | 'genre' | 'platform' | 'status' | 'releaseYear' | 'hoursPlayed';
const SORTABLE: Record<SortField, (a: Game, b: Game) => number> = {
  title: (a, b) => a.title.localeCompare(b.title),
  genre: (a, b) => a.genre.localeCompare(b.genre),
  platform: (a, b) => a.platform.localeCompare(b.platform),
  status: (a, b) => a.status.localeCompare(b.status),
  releaseYear: (a, b) => a.releaseYear - b.releaseYear,
  hoursPlayed: (a, b) => a.hoursPlayed - b.hoursPlayed,
};

export const games = new Hono();

games.get('/', (c) => {
  const search = c.req.query('search')?.toLowerCase() ?? '';
  const page = Math.max(1, Number(c.req.query('page') ?? 1));
  const perPage = Math.max(1, Number(c.req.query('perPage') ?? 7));
  const sort = c.req.query('sort') as SortField | undefined;
  const dir = (c.req.query('dir') === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc';

  const filtered = search
    ? GAMES.filter(
        (g) =>
          g.title.toLowerCase().includes(search) ||
          g.developer.toLowerCase().includes(search) ||
          g.genre.toLowerCase().includes(search) ||
          g.platform.toLowerCase().includes(search),
      )
    : GAMES.slice();

  if (sort && SORTABLE[sort]) {
    const cmp = SORTABLE[sort];
    filtered.sort((a, b) => (dir === 'asc' ? cmp(a, b) : cmp(b, a)));
  }

  const start = (page - 1) * perPage;
  const items = filtered.slice(start, start + perPage);

  return c.json({
    items,
    page,
    perPage,
    total: filtered.length,
    totalPages: Math.max(1, Math.ceil(filtered.length / perPage)),
  });
});

games.get('/:id', (c) => {
  const id = Number(c.req.param('id'));
  const game = GAMES.find((g) => g.id === id);
  if (!game) return c.json({ error: 'not found' }, 404);
  return c.json(game);
});
