/** 零依赖 HTTP 工具：JSON 读写、限流、静态文件。 */
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const buckets = new Map();

export function rateLimited(ip, bucket = 'default', limit = 30) {
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function readJsonBody(req, limitBytes) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes && !settled) {
        settled = true;
        resolve({ error: 'payload_too_large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        resolve({ payload: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      } catch {
        resolve({ error: 'invalid_json' });
      }
    });
    req.on('error', () => {
      if (!settled) resolve({ error: 'aborted' });
    });
  });
}

export function send(res, status, body, type = 'application/json; charset=utf-8') {
  if (res.writableEnded) return;
  res.writeHead(status, {
    'content-type': type,
    'cache-control': type.includes('text/html') ? 'no-cache' : 'public, max-age=3600',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

export function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export async function serveStatic(res, pathname) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(resolve(process.cwd()), 'dist', safe);
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    send(res, 200, body, MIME[extname(file)] ?? 'application/octet-stream');
  } catch {
    try {
      const html = await readFile(join(resolve(process.cwd()), 'dist', 'index.html'));
      send(res, 200, html, MIME['.html']);
    } catch {
      send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    }
  }
}
