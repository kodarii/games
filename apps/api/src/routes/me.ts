import { Hono } from 'hono';
import { isUploadAllowed } from '../infrastructure/cover-storage/upload-allowlist';
import { coverStorageAvailable } from '../wiring';
import type { AuthVariables } from './middleware/require-auth';

export const me = new Hono<{ Variables: AuthVariables }>();

me.get('/permissions', (c) => {
  const email = c.get('user').email;
  return c.json({ canUploadCovers: coverStorageAvailable && isUploadAllowed(email) });
});
