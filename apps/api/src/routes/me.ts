import { Hono } from 'hono';
import { isUploadAllowed } from '../infrastructure/cover-storage/upload-allowlist';
import type { AuthVariables } from './middleware/require-auth';

export interface MeRouterDeps {
  readonly coverStorageAvailable: boolean;
}

export function createMeRouter(deps: MeRouterDeps): Hono<{ Variables: AuthVariables }> {
  const route = new Hono<{ Variables: AuthVariables }>();
  route.get('/permissions', (c) => {
    const email = c.get('user').email;
    return c.json({
      canUploadCovers: deps.coverStorageAvailable && isUploadAllowed(email),
    });
  });
  return route;
}
