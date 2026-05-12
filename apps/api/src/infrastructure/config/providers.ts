/**
 * List of metadata providers this deployment supports. To add a new provider
 * (RAWG, MobyGames, etc.):
 *   1. Append the provider name string here.
 *   2. Construct the adapter + caching decorator in `wiring.ts`.
 * Nothing in domain/application layers needs to change — they treat the
 * provider name as an opaque string and call `isProviderSupported` for the
 * boundary check.
 */
export const SUPPORTED_PROVIDERS = ['igdb'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isProviderSupported(name: string): name is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(name);
}
