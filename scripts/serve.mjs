import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const allowed = new Set(['demo', 'src', 'detector', 'vendor', 'icons', 'popup']);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.wasm':'application/wasm' };
const port = Number(process.env.PORT || 4173);
const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
  try {
    let pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (pathname === '/') { response.writeHead(302, { Location:'/demo/index.html' }).end(); return; }
    const parts = pathname.replaceAll('\\', '/').split('/').filter(Boolean);
    if (!allowed.has(parts[0]) || parts.some(part => part === '..' || part.startsWith('.'))) throw new Error('Not public');
    const target = resolve(root, ...parts);
    if (!target.startsWith(root + sep)) throw new Error('Outside project');
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
    response.writeHead(200, { 'Content-Type':mime[extname(target)] || 'application/octet-stream',
      'Content-Length':info.size, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(target).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404).end('Not found'); }
});
server.listen(port, '127.0.0.1', () => console.log(`LumaWeave preview: http://127.0.0.1:${port}/demo/index.html`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
