// Servidor estático mínimo para hospedar o build (Shard Cloud ou qualquer VPS Node).
// Serve /dist com fallback para index.html (rotas do React) e cabeçalhos de segurança.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Pasta do build relativa a ESTE arquivo (não depende de onde o processo foi iniciado)
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'dist');
const INDEX = join(ROOT, 'index.html');
const PORT = Number(process.env.PORT) || 80;
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

if (!existsSync(INDEX)) {
  console.error(`[EVENTOID] ERRO: build não encontrado em ${INDEX}. Envie a pasta "dist" junto com o server.js.`);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) { res.writeHead(403).end(); return; }
    let info = await stat(file).catch(() => null);
    if (!info || info.isDirectory()) { file = INDEX; info = await stat(file); }
    const ext = extname(file);
    const cache = ext === '.html' || file.endsWith('sw.js') ? 'no-cache'
      : url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600';
    res.writeHead(200, { ...SECURITY, 'Content-Type': TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': cache });
    res.end(await readFile(file));
  } catch (err) {
    console.error('[EVENTOID] Erro ao servir', req.url, err?.message ?? err);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Erro no servidor do EVENTOID.');
  }
}).listen(PORT, HOST, () => {
  console.log(`[EVENTOID] online em http://${HOST}:${PORT} — servindo ${ROOT}`);
});
