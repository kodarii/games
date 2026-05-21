import type { MiddlewareHandler } from 'hono';
import { auth } from '../../infrastructure/auth/auth';
import type { Logger } from '../../infrastructure/logging/logger';
import { unauthorizedProblem } from '../_problem-json';

export type AuthVariables = {
  user: typeof auth.$Infer.Session.user;
  session: typeof auth.$Infer.Session.session;
  logger: Logger;
  requestId: string;
};

export const requireAuth: MiddlewareHandler<{ Variables: AuthVariables }> = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.json(unauthorizedProblem(), 401);
  }
  c.set('user', session.user);
  c.set('session', session.session);
  // Enrich the request-scoped logger with the authenticated userId so every
  // subsequent log line in this request includes who triggered it.
  c.set('logger', c.get('logger').child({ userId: session.user.id }));
  await next();
};
