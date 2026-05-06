import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { games as gamesTable } from '../db/schema';

type SeedGame = {
  kind: 'owned' | 'wishlist';
  title: string;
  developer: string | null;
  genre: string;
  releaseYear: number;
  platform: string;
  edition?: string;
  hoursPlayed: number | null;
  status: string | null;
};

const SEED_GAMES: SeedGame[] = [
  {
    kind: 'owned',
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
    kind: 'owned',
    title: 'God of War Ragnarök',
    developer: 'Santa Monica Studio',
    genre: 'Action-Adventure',
    releaseYear: 2022,
    platform: 'PS5',
    hoursPlayed: 68,
    status: 'Playing',
  },
  {
    kind: 'owned',
    title: 'Bloodborne',
    developer: 'FromSoftware',
    genre: 'Action RPG',
    releaseYear: 2015,
    platform: 'PS4',
    hoursPlayed: 95,
    status: 'Completed',
  },
  {
    kind: 'owned',
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
    kind: 'owned',
    title: 'Elden Ring',
    developer: 'FromSoftware',
    genre: 'Action RPG',
    releaseYear: 2022,
    platform: 'PS5',
    hoursPlayed: 120,
    status: 'Completed',
  },
  {
    kind: 'owned',
    title: 'Final Fantasy VII Rebirth',
    developer: 'Square Enix',
    genre: 'JRPG',
    releaseYear: 2024,
    platform: 'PS5',
    hoursPlayed: 8,
    status: 'Playing',
  },
  {
    kind: 'owned',
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
    kind: 'owned',
    title: 'Persona 5 Royal',
    developer: 'Atlus',
    genre: 'JRPG',
    releaseYear: 2020,
    platform: 'PS4',
    hoursPlayed: 103,
    status: 'Completed',
  },
  {
    kind: 'owned',
    title: 'Uncharted 4',
    developer: 'Naughty Dog',
    genre: 'Action-Adventure',
    releaseYear: 2016,
    platform: 'PS4',
    hoursPlayed: 18,
    status: 'Completed',
  },
  {
    kind: 'owned',
    title: 'Spider-Man 2',
    developer: 'Insomniac Games',
    genre: 'Open World',
    releaseYear: 2023,
    platform: 'PS5',
    hoursPlayed: 0,
    status: 'Backlog',
  },
  {
    kind: 'wishlist',
    title: "Demon's Souls",
    developer: 'Bluepoint Games',
    genre: 'Action RPG',
    releaseYear: 2020,
    platform: 'PS5',
    hoursPlayed: null,
    status: null,
  },
  {
    kind: 'owned',
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
    kind: 'owned',
    title: 'Returnal',
    developer: 'Housemarque',
    genre: 'Roguelike',
    releaseYear: 2021,
    platform: 'PS5',
    hoursPlayed: 24,
    status: 'Playing',
  },
  {
    kind: 'owned',
    title: 'Ratchet & Clank: Rift Apart',
    developer: 'Insomniac Games',
    genre: 'Platformer',
    releaseYear: 2021,
    platform: 'PS5',
    hoursPlayed: 15,
    status: 'Completed',
  },
  {
    kind: 'owned',
    title: 'Metal Gear Solid 4',
    developer: 'Kojima Productions',
    genre: 'Stealth Action',
    releaseYear: 2008,
    platform: 'PS3',
    hoursPlayed: 22,
    status: 'Completed',
  },
  {
    kind: 'owned',
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
  // Seed disabled — games are per-user, seeding without a userId is not supported
}
