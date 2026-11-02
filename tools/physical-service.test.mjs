import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { buildXlsx, PHYSICAL_HEADER } from './test-xlsx.mjs';
import { postgresAvailable, withDisposableDatabase } from './test-postgres.mjs';
import { createSnapshotRepository, snapshotHash, sanitizeSnapshot } from '../lib/snapshot-store.mjs';

const { createPhysicalService } = await import('../lib/physical-service.mjs').catch(() => ({}));
const { createPhysicalLedger } = await import('../lib/physical-ledger.mjs').catch(() => ({}));

// Synthetic contract fixtures only.
const retrieved = '2026-10-30T12:00:00.000Z';
function seed() {
  const tables = {
    google_consumos: [{ order: 'TEST-1', sku: 'TEST-M', quantity: 3, date: '2026-09-01', tech: 'TEST-T1', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 2 }],
    sku_catalog: [{ sku: 'TEST-M', description: 'Synthetic meters', cost: 4, unit: 'M' }, { sku: 'TEST-P', description: 'Synthetic pieces', cost: 2, unit: 'PZA' }],
  };
  const tabs = { google_consumos: 'Consumos', sku_catalog: 'Catálogo SKUs' };
  return { tables, sources: Object.fromEntries(Object.entries(tables).map(([t, rows]) => [t, { source_type: 'GOOGLE_SHEETS_API_READ_ONLY', source_tab: tabs[t], original_data_rows: rows.length, retrieved_at: retrieved, sanitized: true }])) };
}
const line = (take, sku, count, date = '2026-10-15') => [take, 'Mensual', '', date, '', 'Synthetic Tech', 'TEST-T1', sku, 'Synthetic', 'No', count, '', '', ''];
const file = (...rows) => buildXlsx([{ name: 'Toma', rows: [PHYSICAL_HEADER, ...rows] }]);
const clock = () => new Date('2026-10-31T18:00:00.000Z');

function memoryStores(initial = seed()) {
  const snapshots = new Map(), ledger = [];
  let active = null;
  const put = data => { const clean = sanitizeSnapshot(data), hash = snapshotHash(clean), id = [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-'); if (!snapshots.has(id)) snapshots.set(id, { id, captured_at: retrieved, data: clean }); return id; };
  active = put(initial);
  const writes = { snapshots: 0, ledger: 0 };
  const repository = {
    loadSnapshot: async () => active ? snapshots.get(active) : null,
    getActiveSnapshotId: async () => active,
    publishSnapshot: async (data, { expectedSnapshotId, afterActivation }) => {
      const id = put(data);
      if (active !== expectedSnapshotId && active !== id) throw Object.assign(new Error('conflict'), { code: 'SNAPSHOT_CONFLICT' });
      active = id; writes.snapshots++;
      const extra = (afterActivation?.(id) || []).map(statement => { const record = statement.values[0]; if (ledger.some(b => b.id === record.id)) return []; ledger.push(record); writes.ledger++; return [{ id: record.id }]; });
      return { id, extra };
    },
  };
  const memoryLedger = {
    recordStatement: (batch, { baseSnapshotId, resultSnapshotId, actor }) => ({ text: '-- memory', values: [{ ...batch, base_snapshot_id: baseSnapshotId, result_snapshot_id: resultSnapshotId, actor, seq: ledger.length + 1, created_at: clock().toISOString() }] }),
    getBatch: async id => ledger.find(b => b.id === id) || null,
    activeImportBatches: async () => ledger.filter(b => b.action === 'IMPORT' && !ledger.some(r => r.reverts_batch === b.id)).map(b => ({ id: b.id, rows: b.rows })),
    listBatches: async () => [...ledger].reverse().map(({ rows, ...meta }) => ({ ...meta, reverted_by: ledger.find(r => r.reverts_batch === meta.id)?.id || null })),
  };
  return { repository, ledger: memoryLedger, writes, state: () => ({ active, snapshots, ledger }) };
}

test('physical service contract exists', () => {
  assert.equal(typeof createPhysicalService, 'function');
  assert.equal(typeof createPhysicalLedger, 'function');
});

test('preview validates against the active snapshot and writes nothing', async () => {
  const stores = memoryStores(), service = createPhysicalService({ ...stores, clock });
  const preview = await service.preview({ buffer: file(line('T1', 'TEST-M', 5)), filename: 'toma.xlsx' });
  assert.equal(preview.can_apply, true);
  assert.equal(preview.base_snapshot.id, stores.state().active);
  assert.equal(preview.stats.new, 1);
  assert.deepEqual(stores.writes, { snapshots: 0, ledger: 0 });
});

test('apply publishes snapshot and ledger together; retry is idempotent', async () => {
  const stores = memoryStores(), service = createPhysicalService({ ...stores, clock });
  const buffer = file(line('T1', 'TEST-M', 5), line('T1', 'TEST-P', 2));
  const preview = await service.preview({ buffer, filename: 'toma.xlsx' });
  const applied = await service.apply({ buffer, filename: 'toma.xlsx', expectedSha: preview.file.sha256, baseSnapshotId: preview.base_snapshot.id });
  assert.equal(applied.idempotent, false);
  assert.notEqual(applied.snapshot_id, preview.base_snapshot.id);
  const { active, snapshots, ledger } = stores.state();
  assert.equal(active, applied.snapshot_id);
  assert.equal(snapshots.get(active).data.tables.physical_counts.length, 2);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].base_snapshot_id, preview.base_snapshot.id);
  assert.equal(ledger[0].result_snapshot_id, active);
  assert.equal(ledger[0].actor, 'admin_key');
  assert.equal(snapshots.get(active).captured_at, retrieved, 'Sheets capture time is not presented as refreshed');
  const retry = await service.apply({ buffer, filename: 'toma.xlsx', expectedSha: preview.file.sha256, baseSnapshotId: preview.base_snapshot.id });
  assert.equal(retry.idempotent, true); assert.equal(retry.batch_id, applied.batch_id);
  assert.equal(stores.state().ledger.length, 1);
});

test('apply refuses changed files, stale bases and invalid content', async () => {
  const stores = memoryStores(), service = createPhysicalService({ ...stores, clock });
  const buffer = file(line('T1', 'TEST-M', 5));
  const preview = await service.preview({ buffer, filename: 'toma.xlsx' });
  await assert.rejects(service.apply({ buffer: file(line('T1', 'TEST-M', 6)), filename: 'toma.xlsx', expectedSha: preview.file.sha256, baseSnapshotId: preview.base_snapshot.id }), { code: 'FILE_CHANGED' });
  await assert.rejects(service.apply({ buffer, filename: 'toma.xlsx', expectedSha: preview.file.sha256, baseSnapshotId: '00000000-0000-4000-8000-000000000001' }), { code: 'SNAPSHOT_CONFLICT' });
  const bad = file(line('T1', 'TEST-M', -1));
  const badPreview = await service.preview({ buffer: bad, filename: 'mala.xlsx' });
  await assert.rejects(service.apply({ buffer: bad, filename: 'mala.xlsx', expectedSha: badPreview.file.sha256, baseSnapshotId: badPreview.base_snapshot.id }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(service.apply({ buffer, filename: 'toma.xlsx', baseSnapshotId: preview.base_snapshot.id }), { code: 'PREVIEW_REQUIRED' });
  assert.deepEqual(stores.writes, { snapshots: 0, ledger: 0 });
});

test('revert restores the previous effective count and cannot be repeated', async () => {
  const stores = memoryStores(), service = createPhysicalService({ ...stores, clock });
  const apply = async buffer => { const p = await service.preview({ buffer, filename: 'toma.xlsx' }); return service.apply({ buffer, filename: 'toma.xlsx', expectedSha: p.file.sha256, baseSnapshotId: p.base_snapshot.id }); };
  const first = await apply(file(line('K', 'TEST-M', 5)));
  const second = await apply(file(line('K', 'TEST-M', 8)));
  const counts = () => stores.state().snapshots.get(stores.state().active).data.tables.physical_counts?.map(r => r.count) || [];
  assert.deepEqual(counts(), [8]);
  const reverted = await service.revert({ batchId: second.batch_id, baseSnapshotId: second.snapshot_id });
  assert.deepEqual(counts(), [5]);
  assert.equal(reverted.snapshot_id, first.snapshot_id, 'identical content reuses the immutable earlier snapshot');
  await assert.rejects(service.revert({ batchId: second.batch_id, baseSnapshotId: reverted.snapshot_id }), { code: 'BATCH_NOT_ACTIVE' });
  await assert.rejects(service.revert({ batchId: reverted.batch_id, baseSnapshotId: reverted.snapshot_id }), { code: 'BATCH_NOT_ACTIVE' });
  const history = await service.history();
  assert.deepEqual(history.batches.map(b => b.action), ['REVERT', 'IMPORT', 'IMPORT']);
  assert.equal(history.batches[1].reverted_by, reverted.batch_id);
  assert.ok(history.batches.every(b => !('rows' in b)), 'history never returns counted rows');
});

test('no active snapshot means explicit SNAPSHOT_REQUIRED, not an empty import', async () => {
  const stores = memoryStores();
  stores.repository.loadSnapshot = async () => null;
  const service = createPhysicalService({ ...stores, clock });
  await assert.rejects(service.preview({ buffer: file(line('T1', 'TEST-M', 5)), filename: 'toma.xlsx' }), { code: 'SNAPSHOT_REQUIRED' });
});

const migrations = async () => Promise.all(['20261031_001_snapshots.sql', '20261102_001_physical_imports.sql'].map(name => fs.readFile(new URL('../db/migrations/' + name, import.meta.url), 'utf8')));

test('PostgreSQL ledger: atomic activation, idempotency, revert and append-only', { skip: !postgresAvailable }, async () => {
  const [snapshotsSql, physicalSql] = await migrations();
  await withDisposableDatabase([snapshotsSql, physicalSql, physicalSql], async (_database, adapter) => {
    const repository = createSnapshotRepository(adapter), ledger = createPhysicalLedger(adapter);
    const base = await repository.publishSnapshot(seed(), { capturedAt: retrieved });
    const service = createPhysicalService({ repository, ledger, clock });
    const buffer = file(line('K', 'TEST-M', 5));
    const preview = await service.preview({ buffer, filename: 'toma.xlsx' });
    assert.equal(preview.base_snapshot.id, base.id);
    // A competing publication between preview and apply must abort BOTH writes.
    const other = seed(); other.tables.google_consumos[0].quantity = 9;
    const competing = await repository.publishSnapshot(other, { expectedSnapshotId: base.id });
    await assert.rejects(service.apply({ buffer, filename: 'toma.xlsx', expectedSha: preview.file.sha256, baseSnapshotId: base.id }), { code: 'SNAPSHOT_CONFLICT' });
    assert.equal((await adapter.query('SELECT count(*)::integer AS n FROM greencall_private.physical_import_batches', []))[0].n, 0);
    const fresh = await service.preview({ buffer, filename: 'toma.xlsx' });
    assert.equal(fresh.base_snapshot.id, competing.id);
    const applied = await service.apply({ buffer, filename: 'toma.xlsx', expectedSha: fresh.file.sha256, baseSnapshotId: competing.id });
    assert.equal(await repository.getActiveSnapshotId(), applied.snapshot_id);
    assert.equal((await repository.loadSnapshot()).data.tables.physical_counts[0].import_batch, applied.batch_id);
    assert.equal((await service.apply({ buffer, filename: 'toma.xlsx', expectedSha: fresh.file.sha256, baseSnapshotId: competing.id })).idempotent, true);
    const reverted = await service.revert({ batchId: applied.batch_id, baseSnapshotId: applied.snapshot_id });
    assert.equal(reverted.snapshot_id, competing.id);
    assert.equal((await repository.loadSnapshot()).data.tables.physical_counts, undefined);
    const history = await service.history();
    assert.deepEqual(history.batches.map(b => [b.action, b.row_count]), [['REVERT', 0], ['IMPORT', 1]]);
    assert.equal(history.batches[1].reverted_by, reverted.batch_id);
    // Reverting twice is blocked by the database itself, not only by the service.
    await assert.rejects(adapter.query(`INSERT INTO greencall_private.physical_import_batches (id, action, reverts_batch, base_snapshot_id, result_snapshot_id, rows, row_count, stats, actor)
      VALUES ('00000000-0000-4000-8000-0000000000aa', 'REVERT', $1, $2, $2, '[]', 0, '{}', 'admin_key')`, [applied.batch_id, competing.id]), /duplicate key|unique/i);
    await assert.rejects(adapter.query('UPDATE greencall_private.physical_import_batches SET actor = $1', ['x']), /append-only/);
    await assert.rejects(adapter.query('DELETE FROM greencall_private.physical_import_batches', []), /append-only/);
    const grants = await adapter.query("SELECT count(*)::integer AS n FROM information_schema.role_table_grants WHERE table_schema = 'greencall_private' AND table_name = 'physical_import_batches' AND grantee = 'PUBLIC'", []);
    assert.equal(grants[0].n, 0);
  });
});
