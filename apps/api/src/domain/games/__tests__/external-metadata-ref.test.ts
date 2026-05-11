import { describe, expect, it } from 'bun:test';
import { ExternalMetadataRef } from '../external-metadata-ref';

describe('ExternalMetadataRef', () => {
  it('creates ref with all fields when providerId is non-empty', () => {
    const matchedAt = new Date('2026-05-11T10:00:00.000Z');
    const r = ExternalMetadataRef.create({
      providerName: 'igdb',
      providerId: '12345',
      matchedAt,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.providerName).toBe('igdb');
      expect(r.value.providerId).toBe('12345');
      expect(r.value.matchedAt).toEqual(matchedAt);
    }
  });

  it('rejects empty providerId with provider_id_empty', () => {
    const r = ExternalMetadataRef.create({
      providerName: 'igdb',
      providerId: '',
      matchedAt: new Date(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('provider_id_empty');
  });

  it('rejects whitespace-only providerId with provider_id_empty', () => {
    const r = ExternalMetadataRef.create({
      providerName: 'igdb',
      providerId: '   ',
      matchedAt: new Date(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('provider_id_empty');
  });

  it('trims providerId on successful create', () => {
    const r = ExternalMetadataRef.create({
      providerName: 'igdb',
      providerId: '  42 ',
      matchedAt: new Date(),
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.providerId).toBe('42');
  });

  it('fromTrusted bypasses validation', () => {
    const ref = ExternalMetadataRef.fromTrusted({
      providerName: 'igdb',
      providerId: 'raw-id',
      matchedAt: new Date(0),
    });
    expect(ref.providerId).toBe('raw-id');
  });
});
