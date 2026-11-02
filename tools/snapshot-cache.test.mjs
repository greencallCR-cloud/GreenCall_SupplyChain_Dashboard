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

function viewStore(activeId = 'S1') {
  const views = new Map(), calls = { get: 0, put: 0 };
  return { calls, views, store: {
    activeId: async () => activeId,
    get: async (id, key) => { calls.get++; return views.get(id + '|' + key) || null; },
    put: async (id, key, payload) => { calls.put++; views.set(id + '|' + key, JSON.parse(JSON.stringify(payload))); },
  } };
}

test('a cold instance serves a persisted view without loading the snapshot', async () => {
  const { fixtureData } = await import('./snapshot-cache.fixture.mjs');
  const v = viewStore();
  let loads = 0;
  const warm = createDashboardService({ loadSnapshot: async () => { loads++; return { id: 'S1', captured_at: '2026-10-30T12:00:00.000Z', data: fixtureData() }; }, views: v.store, engine: 'E1' });
  const first = await warm.getDashboard({});
  assert.equal(loads, 1); assert.equal(v.calls.put, 1);
  const cold = createDashboardService({ loadSnapshot: async () => { loads++; throw new Error('must not load'); }, views: v.store, engine: 'E1' });
  const served = await cold.getDashboard({});
  assert.equal(loads, 1, 'served from the persisted view');
  assert.deepEqual(served.kpis, first.kpis);
  assert.equal(served.snapshot.id, 'S1');
});

test('views are isolated by snapshot id and engine version', async () => {
  const { fixtureData } = await import('./snapshot-cache.fixture.mjs');
  const v = viewStore('S1');
  let loads = 0;
  const loader = async () => { loads++; return { id: 'S1', captured_at: '2026-10-30T12:00:00.000Z', data: fixtureData() }; };
  await createDashboardService({ loadSnapshot: loader, views: v.store, engine: 'E1' }).getDashboard({});
  await createDashboardService({ loadSnapshot: loader, views: v.store, engine: 'E2' }).getDashboard({});
  assert.equal(loads, 2, 'a new deploy (engine) does not reuse an old computation');
  const v2 = viewStore('S2'); for (const [k, val] of v.views) v2.views.set(k, val);
  await createDashboardService({ loadSnapshot: async () => { loads++; return { id: 'S2', captured_at: '2026-10-30T12:00:00.000Z', data: fixtureData() }; }, views: v2.store, engine: 'E1' }).getDashboard({});
  assert.equal(loads, 3, 'a new snapshot id misses');
});

test('a failing view store never breaks the dashboard', async () => {
  const { fixtureData } = await import('./snapshot-cache.fixture.mjs');
  const broken = { activeId: async () => { throw new Error('db down'); }, get: async () => { throw new Error('x'); }, put: async () => { throw new Error('x'); } };
  const d = await createDashboardService({ loadSnapshot: async () => ({ id: 'S1', captured_at: '2026-10-30T12:00:00.000Z', data: fixtureData() }), views: broken, engine: 'E1' }).getDashboard({});
  assert.equal(d.data_state, 'ready');
});

test('simultaneous cold requests for the same view share one computation', async () => {
  const { fixtureData } = await import('./snapshot-cache.fixture.mjs');
  let loads = 0, analyses = 0;
  const svc = createDashboardService({ loadSnapshot: async () => { loads++; await new Promise(r => setTimeout(r, 30)); return { id: 'S1', captured_at: '2026-10-30T12:00:00.000Z', data: fixtureData() }; }, onAnalyze: () => analyses++ });
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => svc.getDashboard({})));
  assert.equal(analyses, 1, 'one analysis for 5 concurrent identical requests');
  assert.equal(loads, 1);
  assert.ok(results.every(r => r.kpis.orders === results[0].kpis.orders));
});
