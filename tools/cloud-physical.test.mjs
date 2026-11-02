import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudApi } from '../lib/cloud-api.mjs';
import { PhysicalImportError } from '../lib/physical-import.mjs';

// Synthetic HTTP contract tests; the physical service is injected, never a data source.
const env = { GREENCALL_ACCESS_KEY: 'test-access-key-only-000000000000000000000000', GREENCALL_SESSION_SECRET: 'test-signing-secret-only-11111111111111111111', GREENCALL_ADMIN_KEY: 'test-admin-key-only-2222222222222222222222222222' };
const origin = 'https://preview.example';
const req = (path, options = {}) => new Request(origin + path, options);
async function cookie(api, token) {
  const r = await api(req('/api/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ token }) }));
  return r.headers.get('set-cookie').split(';')[0];
}
function fakeService(calls) {
  return {
    preview: async input => { calls.push(['preview', input.filename, input.buffer.length]); return { can_apply: true, file: { sha256: 'a'.repeat(64) }, stats: {}, issues: [], changes: [], base_snapshot: { id: '00000000-0000-4000-8000-000000000001' } }; },
    apply: async input => { calls.push(['apply', input.expectedSha, input.baseSnapshotId]); return { ok: true, batch_id: 'b', snapshot_id: 's', idempotent: false, stats: {} }; },
    revert: async input => { calls.push(['revert', input.batchId, input.baseSnapshotId]); return { ok: true }; },
    history: async () => { calls.push(['history']); return { batches: [], active_snapshot: null }; },
  };
}
const upload = (c, path = '/api/physical/preview', headers = {}, body = Buffer.from('PK-synthetic')) => req(path, { method: 'POST', headers: { cookie: c, origin, 'content-type': 'application/octet-stream', 'x-file-name': encodeURIComponent('Toma Octubre.xlsx'), ...headers }, body });

test('physical routes require admin for writes, any session for history', async () => {
  const calls = [], api = createCloudApi({ env, getPhysicalService: async () => fakeService(calls) });
  for (const path of ['/api/physical/preview', '/api/physical/apply', '/api/physical/revert']) assert.equal((await api(req(path, { method: 'POST', headers: { origin } }))).status, 401);
  assert.equal((await api(req('/api/physical/batches'))).status, 401);
  const viewer = await cookie(api, env.GREENCALL_ACCESS_KEY);
  assert.equal((await api(upload(viewer))).status, 403);
  assert.equal((await api(req('/api/physical/batches', { headers: { cookie: viewer } }))).status, 200);
  assert.deepEqual(calls, [['history']]);
  const admin = await cookie(api, env.GREENCALL_ADMIN_KEY);
  const preview = await api(upload(admin));
  assert.equal(preview.status, 200);
  assert.deepEqual(calls.at(-1), ['preview', 'Toma Octubre.xlsx', 12]);
  assert.equal((await api(upload(admin, '/api/physical/preview', { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await api(req('/api/physical/preview', { headers: { cookie: admin } }))).status, 405);
});

test('apply forwards the preview identity; revert takes bounded JSON', async () => {
  const calls = [], api = createCloudApi({ env, getPhysicalService: async () => fakeService(calls) });
  const admin = await cookie(api, env.GREENCALL_ADMIN_KEY);
  const applied = await api(upload(admin, '/api/physical/apply', { 'x-file-sha256': 'a'.repeat(64), 'x-base-snapshot': '00000000-0000-4000-8000-000000000001' }));
  assert.equal(applied.status, 200);
  assert.deepEqual(calls.at(-1), ['apply', 'a'.repeat(64), '00000000-0000-4000-8000-000000000001']);
  const revert = body => api(req('/api/physical/revert', { method: 'POST', headers: { cookie: admin, origin, 'content-type': 'application/json' }, body }));
  assert.equal((await revert(JSON.stringify({ batch_id: 'x', base_snapshot_id: 'y' }))).status, 200);
  assert.deepEqual(calls.at(-1), ['revert', 'x', 'y']);
  assert.equal((await revert('x'.repeat(5000))).status, 413);
  assert.equal((await revert('{bad')).status, 400);
});

test('uploads are bounded before parsing and errors stay explicit and sanitized', async () => {
  const calls = [];
  const service = { ...fakeService(calls), preview: async () => { throw new PhysicalImportError('NO_PHYSICAL_SHEET', 'Sin hoja de toma física.', 400); }, apply: async () => { throw Object.assign(new PhysicalImportError('VALIDATION_FAILED', 'Errores.', 422), { preview: { issues: [{ row: 2 }] } }); }, history: async () => { throw new Error('postgres://secret@host leaked'); } };
  const api = createCloudApi({ env, getPhysicalService: async () => service });
  const admin = await cookie(api, env.GREENCALL_ADMIN_KEY);
  const big = await api(upload(admin, '/api/physical/preview', {}, Buffer.alloc(4 * 1024 * 1024 + 1)));
  assert.equal(big.status, 413);
  const none = await api(upload(admin));
  assert.equal(none.status, 400); assert.equal((await none.json()).code, 'NO_PHYSICAL_SHEET');
  const invalid = await api(upload(admin, '/api/physical/apply', { 'x-file-sha256': 'a'.repeat(64), 'x-base-snapshot': '00000000-0000-4000-8000-000000000001' }));
  assert.equal(invalid.status, 422); assert.equal((await invalid.json()).preview.issues[0].row, 2);
  const hidden = await api(req('/api/physical/batches', { headers: { cookie: admin } }));
  assert.equal(hidden.status, 503); assert.ok(!(await hidden.text()).includes('secret'));
});

test('without a writer database the physical module reports SIN_CREDENCIALES', async () => {
  const api = createCloudApi({ env });
  const admin = await cookie(api, env.GREENCALL_ADMIN_KEY);
  const r = await api(upload(admin));
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.code, 'SIN_CREDENCIALES');
  const status = await (await api(req('/api/status', { headers: { cookie: admin } }))).json();
  assert.equal(status.access.role, 'admin');
  assert.equal(status.physical.state, 'SIN_CREDENCIALES');
});
