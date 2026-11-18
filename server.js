// Servidor estático mínimo para hospedar o build (Shard Cloud ou qualquer VPS Node).
// Serve /dist com fallback para index.html (rotas do React) e cabeçalhos de segurança.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = join(process.cwd(), 'dist');
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    let info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) { file = join(ROOT, 'index.html'); info = await stat(file); }
    const ext = extname(file);
    const cache = ext === '.html' || file.endsWith('sw.js') ? 'no-cache' : url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
    res.writeHead(200, { ...SECURITY, 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': cache });
    res.end(await readFile(file));
  } catch {
    res.writeHead(500).end('Erro');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`EVENTOID em http://0.0.0.0:${PORT}`));
