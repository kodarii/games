import type { Hono } from 'hono';
import { ZodError, type ZodIssue } from 'zod';
import { type Logger, baseLogger } from '../infrastructure/logging/logger';

export type ProblemJson = {
  type: string;
  title: string;
  status: number;
  detail: string;
  issues?: ZodIssue[];
};

export function zodIssuesToProblemJson(issues: ZodIssue[]): ProblemJson {
  return {
    type: '/errors/validation',
    title: 'Invalid input',
    status: 400,
    detail: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    issues,
  };
}

export function domainProblem(error: { kind: string } | string, status = 400): ProblemJson {
  const detail = typeof error === 'string' ? error : error.kind;
  return {
    type: '/errors/domain',
    title: 'Domain rule violation',
    status,
    detail,
  };
}

export function optimisticLockProblem(
  detail = 'Resource was modified by another request',
): ProblemJson {
  return {
    type: '/errors/optimistic-lock',
    title: 'Conflict',
    status: 409,
    detail,
  };
}

export function payloadTooLargeProblem(detail: string): ProblemJson {
  return {
    type: '/errors/payload-too-large',
    title: 'Too many filter values',
    status: 413,
    detail,
  };
}

export function internalProblem(detail = 'Unexpected error'): ProblemJson {
  return {
    type: '/errors/internal',
    title: 'Internal server error',
    status: 500,
    detail,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Hono generic shape varies per app instance.
export function attachProblemJsonErrorHandler(app: Hono<any, any, any>) {
  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json(zodIssuesToProblemJson(err.issues), 400);
    }
    // Prefer the request-scoped logger (has requestId/userId). Fall back to
    // baseLogger if the error fires before requestContext set it.
    const ctxLogger = (c.get('logger') as Logger | undefined) ?? baseLogger;
    ctxLogger.error({
      event: 'http.unhandled',
      err: err instanceof Error ? err : new Error(String(err)),
    });
    return c.json(internalProblem(), 500);
  });
}
