// Regression (2026-11-03): a NEW stock cut with fewer rows (Existencias ETA 2026-11-02: 7 741 vs
// 8 425 on the 2026-10-26 cut) was blocked by the append-only 0.5 % reduction guard and masked as
// SYNC_UNAVAILABLE. Synthetic rows only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reductionDecision, SheetsSyncError } from '../src/sheets-sync.mjs';

const eta = (n, cut) => Array.from({ length: n }, (_, i) => ({ cut, sku: 'S' + i, location: 'L', quantity: 1 }));
const hist = n => Array.from({ length: n }, (_, i) => ({ order: 'O' + i, sku: 'S', date: '2026-10-01' }));

test('a newer stock cut may legitimately have fewer rows', () => {
  const d = reductionDecision('eta', eta(8425, '2026-10-26'), eta(7741, '2026-11-02'));
  assert.equal(d.allowed, true); assert.equal(d.reason, 'NEW_CUT');
});
test('the same cut shrinking is still blocked (truncated source)', () => {
  const d = reductionDecision('eta', eta(8425, '2026-10-26'), eta(7741, '2026-10-26'));
  assert.equal(d.allowed, false); assert.equal(d.code, 'SOURCE_REDUCTION');
});
test('an older cut is never accepted, and a new cut losing more than half is blocked', () => {
  assert.equal(reductionDecision('eta', eta(1000, '2026-10-26'), eta(990, '2026-10-01')).allowed, false);
  const half = reductionDecision('eta', eta(1000, '2026-10-26'), eta(400, '2026-11-02'));
  assert.equal(half.allowed, false); assert.equal(half.code, 'SOURCE_REDUCTION');
});
test('inventory_real and sap_serials use their own cut fields', () => {
  const inv = (n, c) => Array.from({ length: n }, () => ({ eta_cut: c, sap_cut: c, sku: 'S', quantity: 1 }));
  assert.equal(reductionDecision('inventory_real', inv(3707, '2026-10-25'), inv(3300, '2026-11-02')).allowed, true);
  const ser = (n, c) => Array.from({ length: n }, (_, i) => ({ cut: c, serial: 'X' + i }));
  assert.equal(reductionDecision('sap_serials', ser(4000, '2026-10-26'), ser(3800, '2026-11-02')).allowed, true);
});
test('append-only histories keep the 0.5 % guard regardless of dates', () => {
  const d = reductionDecision('dispatch_serial', hist(17647), hist(17000));
  assert.equal(d.allowed, false); assert.equal(d.code, 'SOURCE_REDUCTION');
  assert.equal(reductionDecision('dispatch_serial', hist(17647), hist(17640)).allowed, true, 'within 0.5 %');
  assert.equal(reductionDecision('technicians', hist(36), hist(20)).allowed, true, 'small tables (<=100) are not guarded');
});
test('errors carry a stable code and a safe detail without operational values', () => {
  const e = new SheetsSyncError('SOURCE_REDUCTION', 'msg', { tab: 'Existencias ETA', reduction_pct: 8.1 });
  assert.equal(e.code, 'SOURCE_REDUCTION'); assert.deepEqual(e.safe, { tab: 'Existencias ETA', reduction_pct: 8.1 });
});

test('failure description names the stage and never leaks upstream messages', async () => {
  const { describeSyncFailure, runSyncCloud } = await import('./sync-cloud.mjs');
  const red = Object.assign(new SheetsSyncError('SOURCE_REDUCTION', 'Existencias ETA: 8425 filas anteriores vs 7741 actuales', { tab: 'Existencias ETA', reduction_pct: 8.1, detail: 'mismo corte' }), { stage: 'SHEETS_READ' });
  const d = describeSyncFailure(red);
  assert.deepEqual(d, { ok: false, stage: 'SHEETS_READ', code: 'SOURCE_REDUCTION', detail: { tab: 'Existencias ETA', reduction_pct: 8.1, detail: 'mismo corte' } });
  assert.ok(!JSON.stringify(d).includes('8425'), 'row counts stay out of public logs');
  const pg = Object.assign(new Error('connect to postgresql://sync:secret@host/db failed'), { code: '53300', stage: 'PUBLISH' });
  const p = describeSyncFailure(pg);
  assert.equal(p.code, 'SYNC_UNAVAILABLE'); assert.equal(p.stage, 'PUBLISH'); assert.equal(p.detail.sqlstate, '53300');
  assert.ok(!JSON.stringify(p).includes('secret') && !JSON.stringify(p).includes('postgresql'));
  // Stage is attached by the worker itself.
  const env = { GREENCALL_ALLOW_SNAPSHOT_WRITE: '1', GREENCALL_SNAPSHOT_ENV: 'development', DATABASE_URL: 'postgresql://dev@example.invalid/db' };
  const err = await runSyncCloud({ argv: ['--from-file', '/nonexistent/snapshot.json', '--apply'], env, getActiveSnapshotId: async () => { throw Object.assign(new Error('ECONNREFUSED postgresql://x'), { code: 'ECONNREFUSED' }); } }).catch(e => e);
  const n = describeSyncFailure(err);
  assert.equal(n.stage, 'NEON_CONNECT'); assert.equal(n.detail.error_code, 'ECONNREFUSED');
});
