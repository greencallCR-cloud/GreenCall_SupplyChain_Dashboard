import test from 'node:test';
import assert from 'node:assert/strict';

const { createSnapshotCache } = await import('../lib/snapshot-store.mjs');
const { createDashboardService } = await import('../lib/dashboard-service.mjs');

// Synthetic repository double: counts expensive loads vs cheap pointer reads.
function repo() {
  const r = { active: 'id-1', loads: 0, pointer: 0,
    getActiveSnapshotId: async () => { r.pointer++; return r.active; },
    loadSnapshot: async () => { r.loads++; return { id: r.active, captured_at: '2026-10-30T12:00:00.000Z', data: { tables: {}, sources: {} } }; } };
  return r;
}

test('snapshot payload is reused while the active pointer is unchanged and reloaded when it moves', async () => {
  assert.equal(typeof createSnapshotCache, 'function');
  const cache = createSnapshotCache(), r = repo();
  await cache(r, 'scope-a'); await cache(r, 'scope-a');
  assert.equal(r.loads, 1); assert.equal(r.pointer, 2, 'pointer is revalidated on every call');
  r.active = 'id-2';
  assert.equal((await cache(r, 'scope-a')).id, 'id-2'); assert.equal(r.loads, 2);
  await cache(r, 'scope-b');
  assert.equal(r.loads, 3, 'a different connection scope never reuses another scope payload');
});

test('a race where the pointer moves during load is not cached under the old id', async () => {
  const cache = createSnapshotCache(), r = repo();
  r.loadSnapshot = async () => { r.loads++; return { id: 'id-9', captured_at: '2026-10-30T12:00:00.000Z', data: {} }; };
  await cache(r, 's'); await cache(r, 's');
  assert.equal(r.loads, 2);
});

test('dashboard results are memoized per snapshot id and filter', async () => {
  let loads = 0, snapshot = { id: 'S1', captured_at: '2026-10-30T12:00:00.000Z', data: null };
  const { fixtureData } = await import('./snapshot-cache.fixture.mjs');
  snapshot.data = fixtureData();
  let analyses = 0;
  const service = createDashboardService({ loadSnapshot: async () => { loads++; return snapshot; }, onAnalyze: () => analyses++ });
  await service.getDashboard({}); await service.getDashboard({});
  assert.equal(analyses, 1);
  await service.getDashboard({ sku: 'TEST-M' });
  assert.equal(analyses, 2);
  snapshot = { ...snapshot, id: 'S2' };
  await service.getDashboard({});
  assert.equal(analyses, 3, 'a new snapshot invalidates the memo');
});
