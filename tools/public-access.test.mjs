// Public read-only access (spec v3): anonymous visitors consult sanitized indicators; only the
// admin key unlocks tools, raw rows and writes. Synthetic dashboards only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudApi } from '../lib/cloud-api.mjs';

const secret = 'test-signing-secret-only-11111111111111111111';
const admin = 'test-admin-key-only-2222222222222222222222222222';
const env = { GREENCALL_SESSION_SECRET: secret, GREENCALL_ADMIN_KEY: admin };
const origin = 'https://public.example';
const req = (path, options = {}) => new Request(origin + path, options);
const fullDashboard = () => ({
  kpis: { orders: 7 }, charts: { abc: [{ sku: 'S1', cost: 4 }] }, forecasts: [{ sku: 'S1', pred: [1] }],
  quality: { issues: [{ row: 3 }], cost_coverage: { total: 1 } }, physical: { latest: [{ tech: 'T1', count: 2 }] },
  insights: { dispatch: { orders: 3, sample: [{ acta: 'A-1' }], orphans: [{ row: 9 }], conflicts: [{ key: 'E:T1' }], sku: [{ sku: 'S1', events: 2 }] } },
  business: { policy: { tech: [{ tech: 'T1', serial: 'SER-1', acta: 'A-1', _sheet_row: 4, days: 50 }] }, stock: [{ tech: 'T1', sku: 'S1', quantity: 3 }] },
});
const service = calls => ({ getDashboard: async filter => { calls.push(['dashboard', filter]); return fullDashboard(); }, getRows: async () => { calls.push(['rows']); return { rows: [] }; } });
const login = (api, token, from = origin) => api(req('/api/login', { method: 'POST', headers: { origin: from, 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' }, body: JSON.stringify({ token }) }));
const deepKeys = (value, out = new Set()) => { if (Array.isArray(value)) value.forEach(v => deepKeys(v, out)); else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { out.add(k); deepKeys(v, out); } return out; };

test('anonymous visitors read a sanitized dashboard without any key (access key not required)', async () => {
  const calls = [], api = createCloudApi({ env, getService: async () => service(calls) });
  const r = await api(req('/api/dashboard'));
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.equal(d.kpis.orders, 7); assert.equal(d.charts.abc[0].cost, 4, 'costs are public by owner decision');
  assert.equal(d.access.role, 'public');
  for (const k of ['quality', 'physical']) assert.ok(!(k in d), k + ' is admin-only');
  const keys = deepKeys(d);
  for (const k of ['serial', 'acta', '_sheet_row', 'sample', 'orphans', 'conflicts']) assert.ok(!keys.has(k), k + ' must not reach anonymous visitors');
  assert.equal(d.business.policy.tech[0].days, 50, 'aggregated policy fields stay');
  assert.equal(r.headers.get('cache-control'), 'no-store, private, max-age=0');
});

test('admin-only routes, raw rows and private exports are denied anonymously', async () => {
  const calls = [], api = createCloudApi({ env, getService: async () => service(calls), getPhysicalService: async () => { throw new Error('must not be reached'); }, getExporter: async () => ({ exportCsv: async ({ type }) => new Response('csv:' + type) }) });
  for (const path of ['/api/rows?type=google_consumos', '/api/sheets/status', '/api/physical/batches', '/api/exports?type=physical', '/api/exports?type=google_consumos', '/api/exports?type=intervals']) {
    const r = await api(req(path));
    assert.ok([401, 403].includes(r.status), path + ' → ' + r.status);
  }
  const post = await api(req('/api/physical/apply', { method: 'POST', headers: { origin } }));
  assert.ok([401, 403].includes(post.status));
  assert.ok(!calls.some(c => c[0] === 'rows'));
  for (const type of ['abc', 'planning', 'forecast', 'inventory']) assert.equal((await api(req('/api/exports?type=' + type))).status, 200, type);
});

test('the Administrador button accepts only the admin key and unlocks the full dashboard', async () => {
  const calls = [], api = createCloudApi({ env: { ...env, GREENCALL_ACCESS_KEY: 'test-access-key-only-000000000000000000000000' }, getService: async () => service(calls) });
  assert.equal((await login(api, 'test-access-key-only-000000000000000000000000')).status, 401, 'reader key is not an admin key');
  const ok = await login(api, admin);
  assert.equal(ok.status, 200); assert.equal((await ok.json()).role, 'admin');
  const cookie = ok.headers.get('set-cookie').split(';')[0];
  const d = await (await api(req('/api/dashboard', { headers: { cookie } }))).json();
  assert.equal(d.access.role, 'admin'); assert.ok(d.quality && d.physical);
  assert.equal((await api(req('/api/rows?type=google_consumos', { headers: { cookie } }))).status, 200);
  const status = await (await api(req('/api/status', { headers: { cookie } }))).json();
  assert.equal(status.access.role, 'admin');
  const out = await api(req('/api/logout', { method: 'POST', headers: { origin, cookie } }));
  assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
});

test('public status is generic: no database or source internals', async () => {
  const api = createCloudApi({ env, getSnapshotStatus: async () => ({ state: 'ready', id: 'S1', captured_at: '2026-11-02T00:00:00.000Z' }), checkDatabase: async () => ({ state: 'connected', host: 'secret-host' }) });
  const s = await (await api(req('/api/status'))).json();
  assert.equal(s.access.role, 'public'); assert.equal(s.data.state, 'ready');
  assert.ok(!JSON.stringify(s).includes('secret-host'));
  assert.equal(s.database.state, 'not_disclosed');
});

test('repeated wrong admin keys are rate limited per client (429) without leaking anything', async () => {
  const attempts = new Map();
  const limiter = { count: async k => attempts.get(k) || 0, fail: async k => { attempts.set(k, (attempts.get(k) || 0) + 1); } };
  const api = createCloudApi({ env, loginLimiter: limiter });
  let last;
  for (let i = 0; i < 11; i++) last = await login(api, 'wrong-key-' + i);
  assert.equal(last.status, 429);
  assert.ok(!(await last.text()).includes(admin));
  assert.equal((await login(api, admin)).status, 429, 'even the right key waits out the window');
});

test('public reads work even when admin login is not configured', async () => {
  const api = createCloudApi({ env: {}, getService: async () => service([]) });
  assert.equal((await api(req('/api/dashboard'))).status, 200);
  assert.equal((await login(api, admin)).status, 503);
});
