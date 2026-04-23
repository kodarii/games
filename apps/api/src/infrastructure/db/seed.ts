import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { games as gamesTable } from '../db/schema';

type SeedGame = {
  title: string;
  developer: string;
  genre: string;
  releaseYear: number;
  platform: string;
  edition?: string;
  hoursPlayed: number;
  status: string;
};

const SEED_GAMES: SeedGame[] = [
  {
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
    title: 'God of War Ragnarök',
    developer: 'Santa Monica Studio',
    genre: 'Action-Adventure',
    releaseYear: 2022,
    platform: 'PS5',
    hoursPlayed: 68,
    status: 'Playing',
  },
  {
    title: 'Bloodborne',
    developer: 'FromSoftware',
    genre: 'Action RPG',
    releaseYear: 2015,
    platform: 'PS4',
    hoursPlayed: 95,
    status: 'Completed',
  },
  {
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
    title: 'Elden Ring',
    developer: 'FromSoftware',
    genre: 'Action RPG',
    releaseYear: 2022,
    platform: 'PS5',
    hoursPlayed: 120,
    status: 'Completed',
  },
  {
    title: 'Final Fantasy VII Rebirth',
    developer: 'Square Enix',
    genre: 'JRPG',
    releaseYear: 2024,
    platform: 'PS5',
    hoursPlayed: 8,
    status: 'Playing',
  },
  {
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
    title: 'Persona 5 Royal',
    developer: 'Atlus',
    genre: 'JRPG',
    releaseYear: 2020,
    platform: 'PS4',
    hoursPlayed: 103,
    status: 'Completed',
  },
  {
    title: 'Uncharted 4',
    developer: 'Naughty Dog',
    genre: 'Action-Adventure',
    releaseYear: 2016,
    platform: 'PS4',
    hoursPlayed: 18,
    status: 'Completed',
  },
  {
    title: 'Spider-Man 2',
    developer: 'Insomniac Games',
    genre: 'Open World',
    releaseYear: 2023,
    platform: 'PS5',
    hoursPlayed: 0,
    status: 'Backlog',
  },
  {
    title: "Demon's Souls",
    developer: 'Bluepoint Games',
    genre: 'Action RPG',
    releaseYear: 2020,
    platform: 'PS5',
    hoursPlayed: 0,
    status: 'Wishlist',
  },
  {
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
    title: 'Returnal',
    developer: 'Housemarque',
    genre: 'Roguelike',
    releaseYear: 2021,
    platform: 'PS5',
    hoursPlayed: 24,
    status: 'Playing',
  },
  {
    title: 'Ratchet & Clank: Rift Apart',
    developer: 'Insomniac Games',
    genre: 'Platformer',
    releaseYear: 2021,
    platform: 'PS5',
    hoursPlayed: 15,
    status: 'Completed',
  },
  {
    title: 'Metal Gear Solid 4',
    developer: 'Kojima Productions',
    genre: 'Stealth Action',
    releaseYear: 2008,
    platform: 'PS3',
    hoursPlayed: 22,
    status: 'Completed',
  },
  {
    title: 'Gran Turismo 7',
    developer: 'Polyphony Digital',
    genre: 'Racing',
    releaseYear: 2022,
    platform: 'PS5',
    hoursPlayed: 33,
    status: 'Playing',
  },
];

export async function seedGamesIfEmpty() {
  const countResult = await db.select({ count: sql<number>`count(*)` }).from(gamesTable);

  const count = countResult[0]?.count ?? 0;

  if (count > 0) {
    console.log(`Database already has ${count} games, skipping seed`);
    return;
  }

  console.log(`Seeding ${SEED_GAMES.length} games...`);

  for (const game of SEED_GAMES) {
    await db.insert(gamesTable).values({
      title: game.title,
      developer: game.developer,
      genre: game.genre,
      releaseYear: game.releaseYear,
      platform: game.platform,
      edition: game.edition ?? null,
      hoursPlayed: game.hoursPlayed,
      status: game.status,
    });
  }

  console.log('Seed completed');
}
