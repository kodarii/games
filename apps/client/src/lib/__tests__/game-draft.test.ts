import { describe, expect, it } from 'bun:test';
import type { Game } from '../../types';
import { draftToPayload, gameToDraft, validateDraft } from '../game-draft';

function baseOwned(overrides: Partial<Game> = {}): Game {
  return {
    id: 'g1',
    kind: 'owned',
    title: 'Elden Ring',
    developer: 'FromSoftware',
    genre: 'Action RPG',
    releaseYear: 2022,
    platform: 'PC',
    edition: 'Deluxe',
    hoursPlayed: 42,
    status: 'Playing',
    format: 'digital',
    coverColor: '#4361ee',
    coverImage: 'https://x/y.png',
    price: 12999,
    purchasedAt: '2024-03-15',
    notes: 'Beat Malenia',
    ...overrides,
  };
}

describe('gameToDraft', () => {
  it('maps all fields from owned game', () => {
    const draft = gameToDraft(baseOwned());
    expect(draft).toEqual({
      title: 'Elden Ring',
      developer: 'FromSoftware',
      genre: 'Action RPG',
      releaseYear: '2022',
      platform: 'PC',
      edition: 'Deluxe',
      hoursPlayed: '42',
      status: 'Playing',
      format: 'digital',
      coverColor: '#4361ee',
      coverImage: 'https://x/y.png',
      priceZl: '129.99',
      purchasedAt: '2024-03-15',
      notes: 'Beat Malenia',
    });
  });

  it('coerces nullable fields to empty strings / nulls', () => {
    const draft = gameToDraft(
      baseOwned({
        developer: null,
        releaseYear: null,
        edition: undefined,
        hoursPlayed: null,
        status: null,
        coverColor: null,
        coverImage: null,
        price: null,
        purchasedAt: null,
        notes: null,
      }),
    );
    expect(draft.developer).toBe('');
    expect(draft.releaseYear).toBe('');
    expect(draft.edition).toBe('');
    expect(draft.hoursPlayed).toBe('');
    expect(draft.status).toBeNull();
    expect(draft.coverImage).toBeNull();
    expect(draft.priceZl).toBe('');
    expect(draft.purchasedAt).toBe('');
    expect(draft.notes).toBe('');
    // coverColor falls back to deterministic palette colour (non-empty).
    expect(draft.coverColor.length).toBeGreaterThan(0);
  });
});

describe('draftToPayload', () => {
  it('produces payload for owned kind', () => {
    const draft = gameToDraft(baseOwned());
    const payload = draftToPayload(draft, { kind: 'owned' });
    expect(payload).toEqual({
      kind: 'owned',
      title: 'Elden Ring',
      developer: 'FromSoftware',
      genre: 'Action RPG',
      releaseYear: 2022,
      platform: 'PC',
      edition: 'Deluxe',
      hoursPlayed: 42,
      status: 'Playing',
      format: 'digital',
      coverColor: '#4361ee',
      coverImage: 'https://x/y.png',
      price: 12999,
      purchasedAt: '2024-03-15',
      notes: 'Beat Malenia',
    });
  });

  it('omits hoursPlayed/status/purchasedAt for wishlist kind', () => {
    const draft = gameToDraft(baseOwned({ kind: 'wishlist' }));
    const payload = draftToPayload(draft, { kind: 'wishlist' });
    expect(payload.kind).toBe('wishlist');
    expect(payload.hoursPlayed).toBeUndefined();
    expect(payload.status).toBeUndefined();
    expect(payload.purchasedAt).toBeUndefined();
  });

  it('maps empty releaseYear to undefined', () => {
    const draft = gameToDraft(baseOwned({ releaseYear: null }));
    const payload = draftToPayload(draft, { kind: 'owned' });
    expect(payload.releaseYear).toBeUndefined();
  });

  it('maps empty priceZl to null (clear semantics)', () => {
    const draft = gameToDraft(baseOwned({ price: null }));
    const payload = draftToPayload(draft, { kind: 'owned' });
    expect(payload.price).toBeNull();
  });

  it('maps empty purchasedAt to null for owned kind', () => {
    const draft = gameToDraft(baseOwned({ purchasedAt: null }));
    const payload = draftToPayload(draft, { kind: 'owned' });
    expect(payload.purchasedAt).toBeNull();
  });

  it('maps empty notes to null', () => {
    const draft = gameToDraft(baseOwned({ notes: null }));
    const payload = draftToPayload(draft, { kind: 'owned' });
    expect(payload.notes).toBeNull();
  });

  it('trims whitespace from string fields', () => {
    const draft = gameToDraft(baseOwned());
    const payload = draftToPayload(
      {
        ...draft,
        title: '  Elden Ring  ',
        developer: '  FromSoftware  ',
        genre: '  Action RPG  ',
        notes: '  hi  ',
      },
      { kind: 'owned' },
    );
    expect(payload.title).toBe('Elden Ring');
    expect(payload.developer).toBe('FromSoftware');
    expect(payload.genre).toBe('Action RPG');
    expect(payload.notes).toBe('hi');
  });

  it('treats blank hoursPlayed as 0 for owned kind', () => {
    const draft = gameToDraft(baseOwned({ hoursPlayed: null }));
    const payload = draftToPayload(draft, { kind: 'owned' });
    expect(payload.hoursPlayed).toBe(0);
  });

  it('maps blank developer to undefined', () => {
    const draft = gameToDraft(baseOwned({ developer: null }));
    const payload = draftToPayload(draft, { kind: 'owned' });
    expect(payload.developer).toBeUndefined();
  });
});

describe('validateDraft', () => {
  it('returns no errors for a valid draft', () => {
    const errors = validateDraft(gameToDraft(baseOwned()));
    expect(errors.title).toBeUndefined();
    expect(errors.platform).toBeUndefined();
  });

  it('flags missing required fields', () => {
    const draft = gameToDraft(baseOwned({ title: '', platform: '' }));
    const errors = validateDraft({ ...draft, title: '   ' });
    expect(errors.title).toBeDefined();
    expect(errors.platform).toBeDefined();
  });
});
