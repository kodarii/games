import { describe, expect, it } from 'bun:test';
import { ExternalMetadataRef } from '../external-metadata-ref';
import { Game } from '../game';

function buildBareGame(
  overrides: {
    releaseYear?: number | null;
    developer?: string | null;
    coverImage?: string | null;
  } = {},
): Game {
  return Game.fromPersistence({
    id: 1,
    externalId: 'ext-1',
    kind: 'owned',
    userId: 'user-1',
    title: 'Test Game',
    developer: overrides.developer ?? null,
    genre: 'RPG',
    releaseYear: overrides.releaseYear ?? null,
    platform: 'PC',
    edition: null,
    hoursPlayed: 0,
    status: 'Backlog',
    format: 'digital',
    coverColor: null,
    coverImage: overrides.coverImage ?? null,
    price: null,
    purchasedAt: null,
    notes: null,
  });
}

function buildRef(): ExternalMetadataRef {
  return ExternalMetadataRef.fromTrusted({
    providerName: 'igdb',
    providerId: '12345',
    matchedAt: new Date('2026-05-11T10:00:00.000Z'),
  });
}

describe('Game.applyMetadata', () => {
  it('overwrites cover, releaseYear, developer and sets metadataRef when snapshot is full', () => {
    const game = buildBareGame();
    const ref = buildRef();
    const result = game.applyMetadata(
      {
        coverImageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg',
        releaseYear: 2015,
        developer: 'CD Projekt RED',
      },
      ref,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const next = result.value;
    expect(next.coverImage).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/abc.jpg');
    expect(next.releaseYear?.value).toBe(2015);
    expect(next.developer).toBe('CD Projekt RED');
    expect(next.metadataRef).not.toBeNull();
    expect(next.metadataRef?.providerId).toBe('12345');
  });

  it('keeps existing releaseYear when snapshot.releaseYear is null', () => {
    const game = buildBareGame({ releaseYear: 2010 });
    const ref = buildRef();
    const result = game.applyMetadata(
      {
        coverImageUrl: null,
        releaseYear: null,
        developer: 'Some Studio',
      },
      ref,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.releaseYear?.value).toBe(2010);
    expect(result.value.developer).toBe('Some Studio');
  });

  it('returns release_year_out_of_range for invalid year', () => {
    const game = buildBareGame();
    const ref = buildRef();
    const result = game.applyMetadata(
      { coverImageUrl: null, releaseYear: 1500, developer: null },
      ref,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('release_year_out_of_range');
  });

  it('returns cover_url_host_not_allowed for malicious cover URL', () => {
    const game = buildBareGame();
    const ref = buildRef();
    const result = game.applyMetadata(
      { coverImageUrl: 'https://evil.com/x.jpg', releaseYear: null, developer: null },
      ref,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('cover_url_host_not_allowed');
  });

  it('preserves identity fields (id, externalId, userId, kind)', () => {
    const game = buildBareGame();
    const ref = buildRef();
    const result = game.applyMetadata(
      { coverImageUrl: null, releaseYear: 2020, developer: null },
      ref,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(game.id);
    expect(result.value.externalId).toBe(game.externalId);
    expect(result.value.userId).toBe(game.userId);
    expect(result.value.kind).toBe(game.kind);
  });

  it('does not mutate the original Game instance', () => {
    const game = buildBareGame({ releaseYear: 2010, developer: 'Old', coverImage: null });
    const ref = buildRef();
    const result = game.applyMetadata(
      {
        coverImageUrl: 'https://utfs.io/f/abc',
        releaseYear: 2020,
        developer: 'New Studio',
      },
      ref,
    );
    expect(result.ok).toBe(true);
    expect(game.releaseYear?.value).toBe(2010);
    expect(game.developer).toBe('Old');
    expect(game.coverImage).toBeUndefined();
    expect(game.metadataRef).toBeNull();
  });
});

describe('Game.fromPersistence with metadata fields', () => {
  it('reconstructs metadataRef when all 3 fields present', () => {
    const game = Game.fromPersistence({
      id: 1,
      externalId: 'ext-1',
      kind: 'owned',
      userId: 'user-1',
      title: 'T',
      developer: null,
      genre: 'g',
      releaseYear: null,
      platform: 'PC',
      edition: null,
      hoursPlayed: 0,
      status: 'Backlog',
      format: 'digital',
      coverColor: null,
      coverImage: null,
      price: null,
      purchasedAt: null,
      notes: null,
      metadataProvider: 'igdb',
      metadataProviderId: '99',
      metadataMatchedAt: '2026-05-11T10:00:00.000Z',
    });
    expect(game.metadataRef).not.toBeNull();
    expect(game.metadataRef?.providerName).toBe('igdb');
    expect(game.metadataRef?.providerId).toBe('99');
    expect(game.metadataRef?.matchedAt.toISOString()).toBe('2026-05-11T10:00:00.000Z');
  });

  it('returns null metadataRef when any of the 3 fields missing', () => {
    const game = Game.fromPersistence({
      id: 1,
      externalId: 'ext-1',
      kind: 'owned',
      userId: 'user-1',
      title: 'T',
      developer: null,
      genre: 'g',
      releaseYear: null,
      platform: 'PC',
      edition: null,
      hoursPlayed: 0,
      status: 'Backlog',
      format: 'digital',
      coverColor: null,
      coverImage: null,
      price: null,
      purchasedAt: null,
      notes: null,
      metadataProvider: 'igdb',
      metadataProviderId: null,
      metadataMatchedAt: '2026-05-11T10:00:00.000Z',
    });
    expect(game.metadataRef).toBeNull();
  });
});
