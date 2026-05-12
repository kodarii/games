import { UTApi } from 'uploadthing/server';
import type { CoverStorage } from '../../application/cover-storage/cover-storage';

function urlToKey(url: string): string | null {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    return segs[segs.length - 1] ?? null;
  } catch {
    return null;
  }
}

export class UploadThingCoverStorage implements CoverStorage {
  private utapi: UTApi;

  constructor(token: string) {
    if (!token) {
      throw new Error('UploadThingCoverStorage: token is required');
    }
    this.utapi = new UTApi({ token });
  }

  async upload(file: File): Promise<{ url: string }> {
    const r = await this.utapi.uploadFiles(file);
    if (r.error || !r.data?.ufsUrl) {
      throw new Error(`uploadthing upload failed: ${r.error?.message ?? 'no url'}`);
    }
    return { url: r.data.ufsUrl };
  }

  /**
   * Best-effort remote delete. Any failure propagates to the caller — the
   * only caller is `CleanupOrphans`, which counts failures and retries on
   * the next sweep. Swallowing the error here would mask transient
   * UploadThing outages from cron metrics.
   */
  async delete(url: string): Promise<void> {
    const key = urlToKey(url);
    if (!key) return;
    await this.utapi.deleteFiles([key]);
  }

  async listOlderThan(olderThanHours: number): Promise<string[]> {
    const cutoff = Date.now() - olderThanHours * 3600 * 1000;
    const all: string[] = [];
    let offset = 0;
    while (true) {
      const r = await this.utapi.listFiles({ limit: 500, offset });
      if (!r.files || r.files.length === 0) break;
      for (const f of r.files) {
        if (f.uploadedAt < cutoff && f.key) {
          all.push(`https://utfs.io/f/${f.key}`);
        }
      }
      if (!r.hasMore) break;
      offset += 500;
    }
    return all;
  }
}
