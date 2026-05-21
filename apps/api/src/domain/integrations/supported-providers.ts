/**
 * Whitelist of metadata providers this deployment supports.
 *
 * To add a new provider (RAWG, MobyGames, …):
 *   1. Append the provider name string here.
 *   2. Construct the adapter + caching decorator in the composition root.
 *
 * Nothing in domain/application beyond `isProviderSupported` needs to change —
 * provider names are opaque strings everywhere else.
 */
export const SUPPORTED_PROVIDERS = ['igdb'] as const;
export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isProviderSupported(name: string): name is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(name);
}
