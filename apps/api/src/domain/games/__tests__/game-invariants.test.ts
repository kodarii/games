import { describe, expect, it } from 'bun:test';
import { GameInvariants, type GameInvariantsInput } from '../game-invariants';

const ownedInput = (): GameInvariantsInput => ({
  kind: 'owned',
  userId: 'user-1',
  title: 'Elden Ring',
  developer: 'FromSoftware',
  genre: 'ARPG',
  releaseYear: 2022,
  platform: 'PS5',
  edition: 'Standard',
  hoursPlayed: 120,
  status: 'Completed',
  format: 'digital',
});

const wishlistInput = (): GameInvariantsInput => ({
  kind: 'wishlist',
  userId: 'user-1',
  title: 'Silksong',
  developer: 'Team Cherry',
  genre: 'Metroidvania',
  platform: 'PC',
  hoursPlayed: null,
  status: null,
  format: 'digital',
});

describe('GameInvariants.validate', () => {
  it('accepts a valid owned input (happy path)', () => {
    const result = GameInvariants.validate(ownedInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Elden Ring');
    expect(result.value.releaseYear?.value).toBe(2022);
    expect(result.value.hoursPlayed?.value).toBe(120);
    expect(result.value.status).toBe('Completed');
  });

  it('accepts a valid wishlist input', () => {
    const result = GameInvariants.validate(wishlistInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe('wishlist');
    expect(result.value.status).toBeNull();
    expect(result.value.hoursPlayed).toBeNull();
  });

  it('rejects missing userId', () => {
    const result = GameInvariants.validate({ ...ownedInput(), userId: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('missing_user_id');
  });

  it('rejects empty title', () => {
    const result = GameInvariants.validate({ ...ownedInput(), title: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('title_empty');
  });

  it('rejects whitespace-only title', () => {
    const result = GameInvariants.validate({ ...ownedInput(), title: '   ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('title_empty');
  });

  it('rejects releaseYear below 1970', () => {
    const result = GameInvariants.validate({ ...ownedInput(), releaseYear: 1900 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('release_year_out_of_range');
  });

  it('rejects releaseYear above 2100', () => {
    const result = GameInvariants.validate({ ...ownedInput(), releaseYear: 2200 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('release_year_out_of_range');
  });

  it('rejects negative hoursPlayed', () => {
    const result = GameInvariants.validate({ ...ownedInput(), hoursPlayed: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('hours_played_negative');
  });

  it('rejects empty platform', () => {
    const result = GameInvariants.validate({ ...ownedInput(), platform: '' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('platform_invalid');
  });

  it('rejects unknown format', () => {
    const result = GameInvariants.validate({
      ...ownedInput(),
      format: 'cartridge' as unknown as GameInvariantsInput['format'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('format_invalid');
  });

  it('rejects wishlist with non-null status', () => {
    const result = GameInvariants.validate({
      ...wishlistInput(),
      status: 'Backlog',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('kind_invalid_state');
    const e = result.error as { kind: string; reason: string };
    expect(e.reason).toBe('wishlist_must_have_null_status');
  });

  it('rejects wishlist with non-null hoursPlayed', () => {
    const result = GameInvariants.validate({
      ...wishlistInput(),
      hoursPlayed: 5,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('kind_invalid_state');
    const e = result.error as { kind: string; reason: string };
    expect(e.reason).toBe('wishlist_must_have_null_hours_played');
  });

  it('rejects owned without status', () => {
    const result = GameInvariants.validate({
      ...ownedInput(),
      status: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('kind_invalid_state');
    const e = result.error as { kind: string; reason: string };
    expect(e.reason).toBe('owned_must_have_status');
  });

  it('rejects owned without hoursPlayed', () => {
    const result = GameInvariants.validate({
      ...ownedInput(),
      hoursPlayed: null,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('kind_invalid_state');
    const e = result.error as { kind: string; reason: string };
    expect(e.reason).toBe('owned_must_have_hours_played');
  });

  it('rejects negative price', () => {
    const result = GameInvariants.validate({ ...ownedInput(), price: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('price_negative');
  });

  it('rejects non-integer price', () => {
    const result = GameInvariants.validate({ ...ownedInput(), price: 12.5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('price_not_integer');
  });

  it('rejects purchasedAt with invalid format', () => {
    const result = GameInvariants.validate({ ...ownedInput(), purchasedAt: '2024/06/15' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('purchased_at_invalid_format');
  });

  it('rejects purchasedAt in the future', () => {
    const result = GameInvariants.validate({ ...ownedInput(), purchasedAt: '2099-01-01' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('purchased_at_in_future');
  });

  it('normalizes blank developer/edition to null/undefined', () => {
    const result = GameInvariants.validate({
      ...ownedInput(),
      developer: '   ',
      edition: '   ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.developer).toBeNull();
    expect(result.value.edition).toBeUndefined();
  });

  it('trims user input strings (title, platform, userId)', () => {
    const result = GameInvariants.validate({
      ...ownedInput(),
      userId: '  user-1  ',
      title: '  Elden Ring  ',
      platform: '  PS5  ',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userId).toBe('user-1');
    expect(result.value.title).toBe('Elden Ring');
    expect(result.value.platform).toBe('PS5');
  });
});
