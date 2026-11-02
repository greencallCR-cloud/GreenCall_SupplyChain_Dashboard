import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { postgresAvailable, withDisposableDatabase } from './test-postgres.mjs';
import { createSnapshotRepository, createViewStore } from '../lib/snapshot-store.mjs';
import { createDashboardService } from '../lib/dashboard-service.mjs';
import { fixtureData } from './snapshot-cache.fixture.mjs';

const migrations = () => Promise.all(['20261031_001_snapshots.sql', '20261103_001_snapshot_views.sql'].map(n => fs.readFile(new URL('../db/migrations/' + n, import.meta.url), 'utf8')));

test('view store contract', () => { assert.equal(typeof createViewStore, 'function'); });

test('PostgreSQL: persisted views round-trip, tampering is ignored, migration is idempotent', { skip: !postgresAvailable }, async () => {
  const [a, b] = await migrations();
  await withDisposableDatabase([a, b, b], async (_db, adapter) => {
    const repo = createSnapshotRepository(adapter), views = createViewStore(adapter);
    const { id } = await repo.publishSnapshot(fixtureData(), { capturedAt: '2026-10-30T12:00:00.000Z' });
    assert.equal(await views.activeId(), id);
    let loads = 0;
    const loader = async () => { loads++; return repo.loadSnapshot(); };
    const first = await createDashboardService({ loadSnapshot: loader, views, engine: 'E1' }).getDashboard({});
    const cold = await createDashboardService({ loadSnapshot: loader, views, engine: 'E1' }).getDashboard({});
    assert.equal(loads, 1, 'second instance served from Neon view');
    assert.deepEqual(cold.kpis, first.kpis);
    await adapter.query("UPDATE greencall_private.snapshot_views SET payload = jsonb_set(payload, '{dashboard,kpis,orders}', '999')", []);
    const after = await createDashboardService({ loadSnapshot: loader, views, engine: 'E1' }).getDashboard({});
    assert.equal(loads, 2, 'a payload that fails its hash is ignored and recomputed');
    assert.notEqual(after.kpis.orders, 999);
  });
});
