import type { MiddlewareHandler } from 'hono';
import { isUploadAllowed } from '../../infrastructure/cover-storage/upload-allowlist';
import { forbiddenProblem } from '../_problem-json';
import type { AuthVariables } from './require-auth';

export const requireUploadPermission: MiddlewareHandler<{ Variables: AuthVariables }> = async (
  c,
  next,
) => {
  const email = c.get('user').email;
  if (!isUploadAllowed(email)) {
    return c.json(forbiddenProblem('Upload not allowed for this user'), 403);
  }
  await next();
};
