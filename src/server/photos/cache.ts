import { mkdir, readdir, readFile, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Disk cache for proxied photos (§19.6, §20 D34): survives restarts, so the
 * wall doesn't fetch every picture from Immich again each morning. Least
 * recently used files go first once the cache grows past its cap.
 */
export interface DiskCache {
  get(key: string): Promise<{ body: Buffer; type: string } | null>;
  put(key: string, body: Buffer): Promise<void>;
}

const safe = (key: string) => key.replace(/[^a-zA-Z0-9_.-]/g, "_");

/** What an image is, from its first bytes, so cache files need no metadata. */
export function sniffImageType(b: Buffer): string {
  if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
  if (b.subarray(0, 4).toString("latin1") === "\x89PNG") return "image/png";
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (b.subarray(4, 12).toString("latin1").startsWith("ftypavi")) return "image/avif";
  return "application/octet-stream";
}

export function diskCache(dir: string, maxBytes: number): DiskCache {
  // NaN or nothing would make every file "too much": prune would empty the cache on each write.
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) throw new Error(`photo cache size must be a positive number of bytes, not ${maxBytes}`);
  let pruning = false;
  const prune = async () => {
    if (pruning) return;
    pruning = true;
    try {
      const files = await Promise.all((await readdir(dir)).map(async (f) => ({ f, s: await stat(join(dir, f)) })));
      let total = files.reduce((n, x) => n + x.s.size, 0);
      // Oldest access first; reads touch the file's time.
      for (const { f, s } of files.sort((a, b) => a.s.mtimeMs - b.s.mtimeMs)) {
        if (total <= maxBytes) break;
        await unlink(join(dir, f)).catch(() => {});
        total -= s.size;
      }
    } finally {
      pruning = false;
    }
  };
  return {
    async get(key) {
      const path = join(dir, safe(key));
      const body = await readFile(path).catch(() => null);
      if (!body) return null;
      const now = new Date();
      await utimes(path, now, now).catch(() => {});
      return { body, type: sniffImageType(body) };
    },
    async put(key, body) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, safe(key)), body);
      await prune();
    },
  };
}
