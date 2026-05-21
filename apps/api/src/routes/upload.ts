import { Hono, type MiddlewareHandler } from 'hono';
import type { CoverStorage } from '../application/cover-storage/cover-storage';
import { invalidFileProblem, uploadFailedProblem } from './_problem-json';
import type { AuthVariables } from './middleware/require-auth';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function serviceUnavailableProblem() {
  return {
    type: '/errors/service-unavailable',
    title: 'Service unavailable',
    status: 503 as const,
    detail: 'Cover storage is not configured',
  };
}

export function createUploadRoute(
  storage: CoverStorage | null,
  idempotencyKeyMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>,
) {
  const route = new Hono<{ Variables: AuthVariables }>();

  route.post('/cover', idempotencyKeyMiddleware, async (c) => {
    if (!storage) {
      return c.json(serviceUnavailableProblem(), 503);
    }

    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json(invalidFileProblem('Malformed multipart body'), 400);
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return c.json(invalidFileProblem('Missing file'), 400);
    }
    if (file.size > MAX_BYTES) {
      return c.json(invalidFileProblem('File too large'), 400);
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return c.json(invalidFileProblem('Disallowed MIME type'), 400);
    }

    try {
      const { url } = await storage.upload(file);
      return c.json({ url });
    } catch (err) {
      // Upstream object-store failure (network, auth, quota). Map to 502 so
      // clients know it is an upstream issue, not their bad request, and log
      // the underlying error for ops.
      c.get('logger').error({
        event: 'upload.cover.failed',
        err: err instanceof Error ? err : new Error(String(err)),
      });
      return c.json(uploadFailedProblem(), 502);
    }
  });

  return route;
}
