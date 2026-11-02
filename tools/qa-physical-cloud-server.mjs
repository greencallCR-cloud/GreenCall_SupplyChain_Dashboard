// Loopback QA server for the Cloud physical-count flow (browser E2E).
// Real HTTP handlers, real physical service/ledger and snapshot repository on a
// DISPOSABLE PostgreSQL (GREENCALL_TEST_POSTGRES_SOCKET or _CONTAINER). Every record
// is labelled synthetic; no Google, Neon or Vercel access. Prints keys only for QA.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCloudApi } from '../lib/cloud-api.mjs';
import { createDashboardService } from '../lib/dashboard-service.mjs';
import { createSnapshotRepository } from '../lib/snapshot-store.mjs';
import { createPhysicalLedger } from '../lib/physical-ledger.mjs';
import { createPhysicalService } from '../lib/physical-service.mjs';
import { postgresAvailable, postgresCommand, postgresAdapter } from './test-postgres.mjs';

if (!postgresAvailable) { console.error('Set GREENCALL_TEST_POSTGRES_SOCKET or GREENCALL_TEST_POSTGRES_CONTAINER (disposable only).'); process.exit(2); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const retrieved = '2026-10-30T12:00:00.000Z';
function seed() {
  const L = 'QA SINTÉTICO · ';
  const catalog = [['QA-UTP', 'Cable UTP exterior', 'M', 5], ['QA-CON', 'Conector RJ45', 'PZA', 2], ['QA-ONT', 'ONT equipo', 'PZA', 120]];
  const tables = {
    sku_catalog: catalog.map(([sku, d, unit, cost]) => ({ sku, description: L + d, unit, cost, center: 'QA', warehouse: 'QA' })),
    technicians: [{ tech: 'QA-T1', name: L + 'Técnico uno', status: 'Activo' }, { tech: 'QA-T2', name: L + 'Técnico dos', status: 'Activo' }],
    google_consumos: [],
    physical_counts: [{ take: 'QA-BASE', date: '2026-09-30', tech: 'QA-T1', tech_name: L + 'Técnico uno', sku: 'QA-UTP', description: L + 'Cable UTP exterior', count: 120, status: 'VALID' }],
  };
  let row = 2;
  for (let m = 0; m < 10; m++) for (const [sku] of catalog) tables.google_consumos.push({ order: `QA-ORD-${m}-${sku}`, date: `2026-${String(m + 1).padStart(2, '0')}-15`, sku, quantity: sku === 'QA-UTP' ? 30 + m : 2, tech: 'QA-T1', center: 'QA', warehouse: 'QA', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: row++ });
  const tabs = { sku_catalog: 'Catálogo SKUs', technicians: 'Tecnicos', google_consumos: 'Consumos' };
  const sources = Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, t === 'physical_counts'
    ? { source_type: 'PRIVATE_PHYSICAL_COUNT_XLSX', source_tab: 'QA-SYNTHETIC', original_data_rows: rows.length, retrieved_at: retrieved, sanitized: true }
    : { source_type: 'GOOGLE_SHEETS_API_READ_ONLY', source_tab: tabs[t], original_data_rows: rows.length, retrieved_at: retrieved, sanitized: true }]));
  return { tables, sources };
}

const database = 'greencall_qa_' + Date.now();
await postgresCommand('postgres', `CREATE DATABASE ${database};`);
for (const name of ['20261031_001_snapshots.sql', '20261102_001_physical_imports.sql']) await postgresCommand(database, await fs.readFile(path.join(root, 'db/migrations', name), 'utf8'));
const adapter = postgresAdapter(database), repository = createSnapshotRepository(adapter);
await repository.publishSnapshot(seed(), { capturedAt: retrieved });
const physical = createPhysicalService({ repository, ledger: createPhysicalLedger(adapter) });
const env = { GREENCALL_ACCESS_KEY: randomBytes(24).toString('hex'), GREENCALL_SESSION_SECRET: randomBytes(24).toString('hex'), GREENCALL_ADMIN_KEY: randomBytes(24).toString('hex'), GREENCALL_PHYSICAL_DATABASE_URL: 'postgres://qa-disposable-placeholder' };
const dashboard = createDashboardService({ loadSnapshot: () => repository.loadSnapshot() });
const api = createCloudApi({ env, getService: async () => dashboard, getSnapshotStatus: () => repository.getSnapshotStatus(), checkDatabase: async () => ({ state: 'not_verified' }), getPhysicalService: async () => physical });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpeg': 'image/jpeg' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const opt = { method: req.method, headers: req.headers }; if (!['GET', 'HEAD'].includes(req.method)) { opt.body = req; opt.duplex = 'half'; }
      const response = await api(new Request(url, opt));
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
    }
    const file = path.resolve(root, 'public', '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(path.join(root, 'public') + path.sep)) { res.writeHead(404); res.end(); return; }
    const body = await fs.readFile(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' }); res.end(body);
  } catch (error) { console.error('[qa]', error?.message); if (!res.headersSent) res.writeHead(500); res.end(); }
});
const shutdown = async () => { server.close(); await postgresCommand('postgres', `DROP DATABASE ${database} WITH (FORCE);`).catch(() => {}); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
server.listen(Number(process.env.PORT || 8790), '127.0.0.1', () => console.log(JSON.stringify({ url: `http://localhost:${server.address().port}`, admin_key: env.GREENCALL_ADMIN_KEY, access_key: env.GREENCALL_ACCESS_KEY, database })));
