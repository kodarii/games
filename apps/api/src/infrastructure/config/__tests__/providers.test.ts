import { describe, expect, it } from 'bun:test';
import { SUPPORTED_PROVIDERS, isProviderSupported } from '../providers';

describe('providers config', () => {
  it('accepts every name in SUPPORTED_PROVIDERS', () => {
    for (const name of SUPPORTED_PROVIDERS) {
      expect(isProviderSupported(name)).toBe(true);
    }
  });

  it('rejects an unknown provider name', () => {
    expect(isProviderSupported('rawg')).toBe(false);
    expect(isProviderSupported('mobygames')).toBe(false);
    expect(isProviderSupported('')).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(isProviderSupported('IGDB')).toBe(false);
    expect(isProviderSupported('Igdb')).toBe(false);
  });
});
