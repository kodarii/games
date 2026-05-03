import { Hono } from 'hono';
import type { CoverStorage } from '../application/cover-storage/cover-storage';
import type { AuthVariables } from './middleware/require-auth';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function createUploadRoute(storage: CoverStorage) {
  const route = new Hono<{ Variables: AuthVariables }>();

  route.post('/cover', async (c) => {
    let formData: FormData;
    try {
      formData = await c.req.formData();
    } catch {
      return c.json({ error: 'invalid_file' }, 400);
    }

    const file = formData.get('file');
    if (!(file instanceof File)) {
      return c.json({ error: 'invalid_file' }, 400);
    }
    if (file.size > MAX_BYTES) {
      return c.json({ error: 'invalid_file' }, 400);
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return c.json({ error: 'invalid_file' }, 400);
    }

    try {
      const { url } = await storage.upload(file);
      return c.json({ url });
    } catch (err) {
      console.error('[upload] failed', err);
      return c.json({ error: 'upload_failed' }, 502);
    }
  });

  return route;
}
