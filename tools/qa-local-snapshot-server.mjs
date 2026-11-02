// Loopback-only QA server over the REAL active snapshot (read role), for authorized local
// reproduction. Never commit output, screenshots or data from this server.
//   node --env-file=/private/greencall.env tools/qa-local-snapshot-server.mjs
// Uses the real HTTP handlers (createCloudApi) with the snapshot cached in memory once.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCloudApi } from '../lib/cloud-api.mjs';
import { createDashboardService } from '../lib/dashboard-service.mjs';
import { loadSnapshot, getSnapshotStatus } from '../lib/snapshot-store.mjs';
import { createExportService } from '../lib/cloud-export.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let cached = null;
const load = async () => (cached ??= loadSnapshot());
const dashboard = createDashboardService({ loadSnapshot: load });
const api = createCloudApi({ getService: async () => dashboard, getExporter: async () => createExportService({ loadSnapshot: load }), getSnapshotStatus, getPhysicalService: async () => null });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpeg': 'image/jpeg' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      if (process.env.QA_API_LATENCY_MS && url.pathname !== '/api/login') await new Promise(r => setTimeout(r, Number(process.env.QA_API_LATENCY_MS)));
      const opt = { method: req.method, headers: req.headers }; if (!['GET', 'HEAD'].includes(req.method)) { opt.body = req; opt.duplex = 'half'; }
      const response = await api(new Request(url, opt));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    const file = path.resolve(root, 'public', '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(path.join(root, 'public') + path.sep)) { res.writeHead(404); res.end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body);
  } catch (error) { if (!res.headersSent) res.writeHead(500); res.end(); }
});
await load();
server.listen(Number(process.env.PORT || 8791), '127.0.0.1', () => console.log(`real-snapshot QA http://localhost:${server.address().port}`));
