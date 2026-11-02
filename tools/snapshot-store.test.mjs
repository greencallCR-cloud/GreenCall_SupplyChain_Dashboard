import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { sanitizeSnapshot, snapshotHash, createSnapshotRepository, readPrivateSnapshot, writePrivateSnapshot, loadSnapshot, getSnapshotStatus } from '../lib/snapshot-store.mjs';
import { createDashboardService } from '../lib/dashboard-service.mjs';

// All records in this file are synthetic contract fixtures, never operational data.
const retrieved = '2026-10-30T12:00:00.000Z';
export function fixture() {
  const tables = {
    google_consumos: [
      { order: 'TEST-1', sku: 'TEST-M', quantity: 3, date: '2026-09-01', tech: 'TEST-T1', center: 'TEST-C', warehouse: 'TEST-W', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 2 },
      { order: 'TEST-1', sku: 'TEST-M', quantity: 2, date: '2026-09-01', tech: 'TEST-T1', center: 'TEST-C', warehouse: 'TEST-W', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 3 },
      { order: 'TEST-2', sku: 'TEST-P', quantity: 1, date: '2026-09-02', tech: 'TEST-T2', center: 'TEST-C', warehouse: 'TEST-W', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 4 },
      { order: 'TEST-3', sku: '7005189', quantity: 1, date: '2026-09-03', tech: 'TEST-T2', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 5 },
    ],
    sku_catalog: [
      { sku: 'TEST-M', description: 'Synthetic material in meters', cost: 4, unit: 'M', center: 'TEST-C', warehouse: 'TEST-W' },
      { sku: 'TEST-P', description: 'Synthetic pieces', cost: null, unit: 'PZA', center: 'TEST-C', warehouse: 'TEST-W' },
    ],
  };
  const sources = Object.fromEntries(Object.entries(tables).map(([type, rows]) => [type, {
    source_type: 'GOOGLE_SHEETS_API_READ_ONLY', source_tab: type === 'google_consumos' ? 'Consumos' : 'Catálogo SKUs',
    original_data_rows: rows.length, retrieved_at: retrieved, sanitized: true,
  }]));
  return { tables, sources };
}

test('validates source-backed snapshots without changing quantities or costs', () => {
  const original = fixture();
  const data = sanitizeSnapshot(original);
  assert.deepEqual(data, original);
  assert.notEqual(data.tables.google_consumos, original.tables.google_consumos);
  assert.equal(data.tables.sku_catalog[1].cost, null);
});

test('rejects malformed, unknown, empty, privacy-unsafe and false-provenance snapshots', () => {
  const cases = [
    {}, { tables: {}, sources: {} }, { ...fixture(), config: { credential_path: 'private' } },
    { ...fixture(), tables: { ...fixture().tables, customers: [] } },
  ];
  for (const mutate of [
    d => { d.tables.google_consumos[0].email = 'synthetic@example.invalid'; },
    d => { d.tables.google_consumos[0].customer = 'Synthetic client'; },
    d => { d.tables.google_consumos[0].description = 'Contact synthetic@example.invalid'; },
    d => { d.tables.google_consumos[0].quantity = Infinity; },
    d => { d.tables.google_consumos[0].quantity = {}; },
    d => { d.tables.google_consumos[0].date = '2026-02-30'; },
    d => { d.tables.google_consumos[0]._sheet_row = -1; },
    d => { d.tables.sku_catalog = []; },
    d => { d.tables.google_consumos = [{ description: 'Synthetic no order/date' }]; d.sources.google_consumos.original_data_rows = 1; },
    d => { d.tables.sku_catalog = [{ description: 'Synthetic no SKU' }]; d.sources.sku_catalog.original_data_rows = 1; },
    d => { d.sources.google_consumos.original_data_rows = 999; },
    d => { d.sources.google_consumos.sanitized = false; },
    d => { d.sources.google_consumos.source_type = 'MOCK'; },
    d => { d.sources.google_consumos.source_tab = 'ODT'; },
    d => { d.sources.google_consumos.retrieved_at = 'tomorrow'; },
    d => { delete d.sources.google_consumos; },
  ]) { const data = fixture(); mutate(data); cases.push(data); }
  for (const candidate of cases) assert.throws(() => sanitizeSnapshot(candidate), { code: 'INVALID_SNAPSHOT' });
});

test('physical counts keep separate private spreadsheet provenance', () => {
  const data = fixture();
  data.tables.physical_counts = [{ take: 'TEST-COUNT', tech: 'TEST-T1', sku: 'TEST-M', date: '2026-09-04', count: 2 }];
  data.sources.physical_counts = { source_type: 'PRIVATE_PHYSICAL_COUNT_XLSX', original_data_rows: 1, retrieved_at: retrieved, sanitized: true };
  assert.equal(sanitizeSnapshot(data).tables.physical_counts[0].count, 2);
});

test('content identity ignores retrieval time and object key order, but includes data corrections', () => {
  const a = fixture(), b = fixture();
  b.sources.google_consumos.retrieved_at = '2026-10-31T12:00:00.000Z';
  b.tables = { sku_catalog: b.tables.sku_catalog, google_consumos: b.tables.google_consumos };
  assert.equal(snapshotHash(a), snapshotHash(b));
  b.tables.google_consumos[0].quantity = 9;
  assert.notEqual(snapshotHash(a), snapshotHash(b));
});

// Adapter models staging outside the activation transaction. A failed ingestion
// retains inert chunks and leaves the previous active snapshot untouched.
function memoryAdapter() {
  let snapshots = new Map(), chunks = new Map(), active = null;
  const calls = [];
  let failActivation = false, failChunk = null, stagedChunks = 0;
  const key = (id, source, part) => [id, source, part].join('|');
  function complete(snapshot, store) {
    if (!snapshot || snapshot.chunk_count !== snapshot.manifest.chunks.length) return false;
    const ownChunks = [...store.chunks.values()].filter(chunk => chunk.snapshot_id === snapshot.id);
    return ownChunks.length === snapshot.chunk_count && snapshot.manifest.chunks.every(expected => {
      const found = store.chunks.get(key(snapshot.id, expected.source, expected.part));
      return found && ['row_count', 'content_hash', 'size_bytes'].every(field => found[field] === expected[field]);
    }) && Object.entries(snapshot.row_counts).every(([source, count]) => ownChunks.filter(chunk => chunk.source === source).reduce((sum, chunk) => sum + chunk.row_count, 0) === count);
  }
  async function execute(text, params, draft) {
    calls.push({ text, params });
    if (/INSERT INTO greencall_private\.snapshots\b/.test(text)) {
      const [id, hash, captured_at, manifest, row_counts, chunk_count] = params;
      if (!draft.snapshots.has(hash)) draft.snapshots.set(hash, { id, content_hash: hash, captured_at, manifest: JSON.parse(manifest), row_counts: JSON.parse(row_counts), chunk_count });
      return [];
    }
    if (/INSERT INTO greencall_private\.snapshot_chunks/.test(text)) {
      if (failChunk !== null && ++stagedChunks === failChunk) throw new Error('Injected private staging failure');
      const [snapshot_id, source, part, rows, row_count, content_hash, size_bytes] = params;
      const identity = key(snapshot_id, source, part);
      if (!draft.chunks.has(identity)) draft.chunks.set(identity, { snapshot_id, source, part, rows: JSON.parse(rows), row_count, content_hash, size_bytes });
      return [];
    }
    if (/INSERT INTO greencall_private\.active_snapshot/.test(text)) {
      if (failActivation) throw new Error('Injected private infrastructure detail');
      const row = draft.snapshots.get(params[0]);
      if (!complete(row, draft)) return [];
      if (params.length > 1 && draft.active !== params[1] && draft.active !== row.id) return [];
      draft.active = row.id;
      return [{ id: row.id }];
    }
    if (/SELECT snapshot_id AS id FROM greencall_private\.active_snapshot/.test(text)) {
      return draft.active ? [{ id: draft.active }] : [];
    }
    if (/FROM greencall_private\.active_snapshot/.test(text)) {
      const row = [...draft.snapshots.values()].find(r => r.id === draft.active);
      return complete(row, draft) ? [row] : [];
    }
    if (/FROM greencall_private\.snapshots s/.test(text)) {
      const row = draft.snapshots.get(params[0]);
      return complete(row, draft) ? [row] : [];
    }
    if (/FROM greencall_private\.snapshot_chunks/.test(text)) {
      const row = draft.chunks.get(key(...params));
      return row ? [row] : [];
    }
    throw new Error('Unexpected test adapter statement');
  }
  return {
    query: (text, params) => execute(text, params, { snapshots, chunks, active }),
    transaction: async statements => {
      const draft = { snapshots: new Map(snapshots), chunks: new Map(chunks), active };
      const results = [];
      for (const statement of statements) results.push(await execute(statement.text, statement.values, draft));
      snapshots = draft.snapshots; chunks = draft.chunks; active = draft.active;
      return results;
    },
    setFailActivation: value => { failActivation = value; },
    setFailChunk: value => { failChunk = value; stagedChunks = 0; },
    corruptStagedChunk: () => { const chunk = [...chunks.values()].find(row => row.snapshot_id !== active && row.source === 'google_consumos'); chunk.rows[0].quantity = 9; },
    truncateActiveChunk: () => { const chunk = [...chunks.values()].find(row => row.snapshot_id === active); chunk.rows.pop(); },
    removeActiveChunk: () => { const [identity] = [...chunks.entries()].find(([, row]) => row.snapshot_id === active); chunks.delete(identity); },
    get count() { return snapshots.size; },
    get chunkCount() { return chunks.size; }, calls,
  };
}

test('publication is idempotent and atomically retains prior activation on failure', async () => {
  const adapter = memoryAdapter(), repository = createSnapshotRepository(adapter);
  assert.equal(await repository.loadSnapshot(), null);
  const first = await repository.publishSnapshot(fixture(), { capturedAt: retrieved });
  const same = await repository.publishSnapshot(fixture(), { capturedAt: '2026-10-31T12:00:00.000Z' });
  assert.equal(same.id, first.id);
  assert.equal(adapter.count, 1);
  assert.equal(adapter.chunkCount, 2);
  const corrected = fixture(); corrected.tables.google_consumos[0].quantity = 8;
  adapter.setFailActivation(true);
  await assert.rejects(repository.publishSnapshot(corrected), { code: 'SNAPSHOT_UNAVAILABLE' });
  assert.equal(adapter.count, 2, 'failed activation retains inert staged history');
  assert.equal((await repository.loadSnapshot()).id, first.id);
  adapter.setFailActivation(false);
  const second = await repository.publishSnapshot(corrected);
  assert.equal(adapter.count, 2);
  assert.notEqual(second.id, first.id);
  assert.equal((await repository.loadSnapshot()).data.tables.google_consumos[0].quantity, 8);
});

test('a corrupt resumed fragment cannot replace the last verified activation', async () => {
  const adapter = memoryAdapter(), repository = createSnapshotRepository(adapter);
  const first = await repository.publishSnapshot(fixture());
  const corrected = fixture(); corrected.tables.google_consumos[0].quantity = 2;
  adapter.setFailActivation(true);
  await assert.rejects(repository.publishSnapshot(corrected), { code: 'SNAPSHOT_UNAVAILABLE' });
  adapter.setFailActivation(false);
  // Preserve the declared count and byte length: metadata-only checks miss this.
  adapter.corruptStagedChunk();
  await assert.rejects(repository.publishSnapshot(corrected), { code: 'INVALID_SNAPSHOT' });
  assert.equal((await repository.loadSnapshot()).id, first.id);
  assert.equal((await repository.getSnapshotStatus()).id, first.id);
});

test('activation compares the expected pointer and accepts idempotent retries', async () => {
  const repository = createSnapshotRepository(memoryAdapter());
  assert.equal(typeof repository.getActiveSnapshotId, 'function');
  assert.equal(await repository.getActiveSnapshotId(), null);
  const first = await repository.publishSnapshot(fixture(), { expectedSnapshotId: null });
  assert.equal(await repository.getActiveSnapshotId(), first.id);
  const corrected = fixture(); corrected.tables.google_consumos[0].quantity = 7;
  await assert.rejects(repository.publishSnapshot(corrected, { expectedSnapshotId: null }), { code: 'SNAPSHOT_CONFLICT' });
  assert.equal(await repository.getActiveSnapshotId(), first.id);
  const second = await repository.publishSnapshot(corrected, { expectedSnapshotId: first.id });
  assert.equal((await repository.publishSnapshot(corrected, { expectedSnapshotId: first.id })).id, second.id);
  assert.equal(await repository.getActiveSnapshotId(), second.id);
  const older = fixture(); older.tables.google_consumos[0].quantity = 5;
  await assert.rejects(repository.publishSnapshot(older, { expectedSnapshotId: first.id }), { code: 'SNAPSHOT_CONFLICT' });
  assert.equal((await repository.loadSnapshot()).id, second.id);
});

test('implicit expectation is captured before staging so a competing publisher wins safely', async () => {
  const adapter = memoryAdapter(), repository = createSnapshotRepository(adapter);
  const first = await repository.publishSnapshot(fixture());
  const slow = fixture(); slow.tables.google_consumos[0].quantity = 5;
  const newer = fixture(); newer.tables.google_consumos[0].quantity = 6;
  let interleaved = false, winner;
  const slowRepository = createSnapshotRepository({ ...adapter, query: async (text, values) => {
    const result = await adapter.query(text, values);
    if (!interleaved && /INSERT INTO greencall_private\.snapshots\b/.test(text)) {
      interleaved = true;
      winner = await repository.publishSnapshot(newer, { expectedSnapshotId: first.id });
    }
    return result;
  } });
  await assert.rejects(slowRepository.publishSnapshot(slow), { code: 'SNAPSHOT_CONFLICT' });
  assert.equal((await repository.loadSnapshot()).id, winner.id);
  assert.equal(adapter.count, 3, 'conflicting publication remains inert history');
});

test('interrupted chunk staging resumes idempotently without exposing incomplete data', async () => {
  const adapter = memoryAdapter(), repository = createSnapshotRepository(adapter);
  const first = await repository.publishSnapshot(fixture());
  const corrected = fixture(); corrected.tables.google_consumos[0].quantity = 10;
  adapter.setFailChunk(2);
  await assert.rejects(repository.publishSnapshot(corrected), { code: 'SNAPSHOT_UNAVAILABLE' });
  assert.equal(adapter.count, 2);
  assert.equal(adapter.chunkCount, 3);
  assert.equal((await repository.loadSnapshot()).id, first.id);
  assert.equal((await repository.getSnapshotStatus()).id, first.id);
  adapter.setFailChunk(null);
  const resumed = await repository.publishSnapshot(corrected);
  const repeated = await repository.publishSnapshot(corrected);
  assert.equal(repeated.id, resumed.id);
  assert.equal(adapter.count, 2);
  assert.equal(adapter.chunkCount, 4);
  assert.equal((await repository.loadSnapshot()).id, resumed.id);
});

test('stages bounded chunks and rejects truncated stored data on load', async () => {
  const data = fixture();
  data.tables.google_consumos = Array.from({ length: 2200 }, (_, i) => ({ ...data.tables.google_consumos[0], order: 'TEST-LARGE-' + i, _sheet_row: i + 2, description: 'Synthetic ' + 'x'.repeat(980) }));
  data.sources.google_consumos.original_data_rows = data.tables.google_consumos.length;
  const adapter = memoryAdapter(), repository = createSnapshotRepository(adapter);
  await repository.publishSnapshot(data);
  const writes = adapter.calls.filter(call => /INSERT INTO greencall_private\.snapshot_chunks/.test(call.text));
  assert.ok(writes.length >= 4);
  for (const { params } of writes) {
    assert.ok(Buffer.byteLength(params[3]) <= 1024 * 1024, 'rows request must stay below Neon HTTP payload ceiling');
    assert.equal(Buffer.byteLength(params[3]), params[6]);
    assert.equal(JSON.parse(params[3]).length, params[4]);
    assert.ok(params[4] <= 2500);
  }
  assert.equal((await repository.loadSnapshot()).data.tables.google_consumos.length, 2200);
  adapter.truncateActiveChunk();
  await assert.rejects(repository.loadSnapshot(), { code: 'INVALID_SNAPSHOT' });
});

test('status does not report readiness when an active manifest is incomplete', async () => {
  const adapter = memoryAdapter(), repository = createSnapshotRepository(adapter);
  await repository.publishSnapshot(fixture());
  adapter.removeActiveChunk();
  assert.deepEqual(await repository.getSnapshotStatus(), { state: 'snapshot_required' });
  assert.equal(await repository.loadSnapshot(), null);
});

test('175000-row synthetic snapshot benchmark', { skip: process.env.GREENCALL_BENCHMARK_SNAPSHOTS !== '1' }, async context => {
  const data = fixture();
  data.tables.google_consumos = Array.from({ length: 175000 }, (_, i) => ({ ...data.tables.google_consumos[0], order: 'SYNTHETIC-' + i, _sheet_row: i + 2, description: 'Synthetic material' }));
  data.sources.google_consumos.original_data_rows = data.tables.google_consumos.length;
  const adapter = memoryAdapter(), repository = createSnapshotRepository(adapter);
  const started = performance.now();
  await repository.publishSnapshot(data, { capturedAt: retrieved });
  const published = performance.now();
  const loaded = await repository.loadSnapshot();
  const finished = performance.now();
  assert.equal(loaded.data.tables.google_consumos.length, 175000);
  const sizes = adapter.calls.filter(call => /INSERT INTO greencall_private\.snapshot_chunks/.test(call.text)).map(({ params }) => Buffer.byteLength(params[3]));
  assert.ok(sizes.every(size => size <= 1024 * 1024));
  context.diagnostic(JSON.stringify({ synthetic: true, rows: 175000, chunks: sizes.length, max_chunk_bytes: Math.max(...sizes), publish_ms: Math.round(published - started), load_ms: Math.round(finished - published), heap_mib: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) }));
});

test('the 128 MiB limit includes the entire private JSON envelope', { skip: process.env.GREENCALL_BENCHMARK_SNAPSHOTS !== '1' }, async () => {
  const maximum = 128 * 1024 * 1024;
  const row = { order: 'O', sku: 'S', date: '2026-01-01', description: 'x'.repeat(1000) };
  const catalog = [{ sku: 'S', cost: 1, unit: 'PZA' }];
  const catalogBytes = Buffer.byteLength(JSON.stringify(catalog[0])) + 1;
  const rowBytes = Buffer.byteLength(JSON.stringify(row)) + 1;
  const count = Math.floor((maximum - catalogBytes) / rowBytes);
  const rows = Array.from({ length: count }, () => row);
  const remainder = maximum - catalogBytes - count * rowBytes;
  const minimumRowBytes = Buffer.byteLength(JSON.stringify({ ...row, description: '' })) + 1;
  if (remainder >= minimumRowBytes) rows.push({ ...row, description: 'y'.repeat(remainder - minimumRowBytes) });
  const data = fixture();
  data.tables = { google_consumos: rows, sku_catalog: catalog };
  data.sources.google_consumos.original_data_rows = rows.length;
  data.sources.sku_catalog.original_data_rows = 1;
  assert.throws(() => sanitizeSnapshot(data), { code: 'INVALID_SNAPSHOT' });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'greencall-snapshot-envelope-'));
  try {
    const file = path.join(dir, 'snapshot.json');
    await assert.rejects(writePrivateSnapshot(file, data), { code: 'INVALID_SNAPSHOT' });
    await assert.rejects(fs.access(file), { code: 'ENOENT' });
    rows.splice(-2);
    data.sources.google_consumos.original_data_rows = rows.length;
    await writePrivateSnapshot(file, data);
    assert.ok((await fs.stat(file)).size <= maximum);
    assert.equal((await readPrivateSnapshot(file)).tables.google_consumos.length, rows.length);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('repository validates before SQL and status selects metadata without private rows', async () => {
  const adapter = memoryAdapter(), repository = createSnapshotRepository(adapter);
  await assert.rejects(repository.publishSnapshot({}), { code: 'INVALID_SNAPSHOT' });
  assert.equal(adapter.calls.length, 0);
  await repository.publishSnapshot(fixture());
  const status = await repository.getSnapshotStatus();
  assert.equal(status.state, 'ready');
  assert.equal(status.row_counts.google_consumos, 4);
  const projection = adapter.calls.at(-1).text.split(/\bFROM\b/i)[0];
  assert.ok(!/payload|manifest|\brows\b/i.test(projection));
  assert.ok(!('data' in status));
});

// Opt-in integration uses a disposable PostgreSQL 17 container started without
// network access or exposed ports. No DATABASE_URL or remote credentials are read.
import { postgresAvailable, postgresCommand as runPostgres, postgresAdapter } from './test-postgres.mjs';

test('PostgreSQL migration, staging, activation and append-only protection', { skip: !postgresAvailable }, async () => {
  const database = 'greencall_test_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  await runPostgres('postgres', `CREATE DATABASE ${database};`);
  try {
    const migration = await fs.readFile(new URL('../db/migrations/20261031_001_snapshots.sql', import.meta.url), 'utf8');
    await runPostgres(database, migration);
    // Applying the additive migration again must preserve data and constraints.
    await runPostgres(database, migration);
    const adapter = postgresAdapter(database);
    const repository = createSnapshotRepository(adapter);
    assert.equal(await repository.loadSnapshot(), null);
    const first = await repository.publishSnapshot(fixture(), { capturedAt: retrieved });
    assert.equal((await repository.publishSnapshot(fixture())).id, first.id);
    assert.equal((await repository.loadSnapshot()).id, first.id);
    assert.equal((await repository.getSnapshotStatus()).state, 'ready');
    const corrected = fixture(); corrected.tables.google_consumos[0].quantity = 14;
    let staged = 0;
    const interrupted = createSnapshotRepository({ ...adapter, query: (text, values) => {
      if (/INSERT INTO greencall_private\.snapshot_chunks/.test(text) && ++staged === 2) throw new Error('Synthetic staging interruption');
      return adapter.query(text, values);
    } });
    await assert.rejects(interrupted.publishSnapshot(corrected), { code: 'SNAPSHOT_UNAVAILABLE' });
    assert.equal((await repository.loadSnapshot()).id, first.id);
    const counts = await adapter.query('SELECT count(*)::integer AS count FROM greencall_private.snapshots', []);
    assert.equal(counts[0].count, 2);
    const second = await repository.publishSnapshot(corrected);
    assert.notEqual(second.id, first.id);
    assert.equal((await repository.loadSnapshot()).data.tables.google_consumos[0].quantity, 14);
    const left = fixture(); left.tables.google_consumos[0].quantity = 3;
    const right = fixture(); right.tables.google_consumos[0].quantity = 4;
    const competing = await Promise.allSettled([
      repository.publishSnapshot(left, { expectedSnapshotId: second.id }),
      repository.publishSnapshot(right, { expectedSnapshotId: second.id }),
    ]);
    assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(competing.filter(result => result.status === 'rejected' && result.reason.code === 'SNAPSHOT_CONFLICT').length, 1);
    const winner = competing.find(result => result.status === 'fulfilled').value;
    assert.equal((await repository.loadSnapshot()).id, winner.id);
    const winnerData = competing[0].status === 'fulfilled' ? left : right;
    assert.equal((await repository.publishSnapshot(winnerData, { expectedSnapshotId: second.id })).id, winner.id);
    const corruptData = fixture(); corruptData.tables.google_consumos[0].quantity = 6;
    const corruptWriter = createSnapshotRepository({ ...adapter, query: (text, values) => {
      if (/INSERT INTO greencall_private\.snapshot_chunks/.test(text) && values[1] === 'google_consumos') {
        const rows = JSON.parse(values[3]); rows[0].quantity = 9;
        const corruptValues = [...values]; corruptValues[3] = JSON.stringify(rows);
        assert.equal(Buffer.byteLength(corruptValues[3]), values[6]);
        return adapter.query(text, corruptValues);
      }
      return adapter.query(text, values);
    } });
    await assert.rejects(corruptWriter.publishSnapshot(corruptData, { expectedSnapshotId: winner.id }), { code: 'INVALID_SNAPSHOT' });
    await assert.rejects(repository.publishSnapshot(corruptData, { expectedSnapshotId: winner.id }), { code: 'INVALID_SNAPSHOT' });
    assert.equal((await repository.loadSnapshot()).id, winner.id);
    // Empty-pointer races exercise INSERT's unique-conflict path, not just UPDATE.
    await adapter.query('DELETE FROM greencall_private.active_snapshot', []);
    assert.equal(await repository.getActiveSnapshotId(), null);
    const initial = await Promise.allSettled([
      repository.publishSnapshot(left, { expectedSnapshotId: null }),
      repository.publishSnapshot(right, { expectedSnapshotId: null }),
    ]);
    assert.equal(initial.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(initial.filter(result => result.status === 'rejected' && result.reason.code === 'SNAPSHOT_CONFLICT').length, 1);
    assert.equal(await repository.getActiveSnapshotId(), initial.find(result => result.status === 'fulfilled').value.id);
    await assert.rejects(adapter.query('UPDATE greencall_private.snapshots SET captured_at = now()', []), /append-only/);
    await assert.rejects(adapter.query('DELETE FROM greencall_private.snapshot_chunks', []), /append-only/);
    const grants = await adapter.query("SELECT count(*)::integer AS count FROM information_schema.role_table_grants WHERE table_schema = 'greencall_private' AND grantee = 'PUBLIC'", []);
    assert.equal(grants[0].count, 0);
  } finally { await runPostgres('postgres', `DROP DATABASE ${database} WITH (FORCE);`); }
});

test('default store with no credentials performs no database access', async () => {
  assert.equal(await loadSnapshot({ env: {} }), null);
  assert.deepEqual(await getSnapshotStatus({ env: {} }), { state: 'not_configured' });
  const { getActiveSnapshotId } = await import('../lib/snapshot-store.mjs');
  assert.equal(typeof getActiveSnapshotId, 'function');
  assert.equal(await getActiveSnapshotId({ env: {} }), null);
});

test('private files reject repository paths and symlink escapes; writes are mode 0600', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'greencall-snapshot-test-'));
  try {
    const destination = path.join(dir, 'snapshot.json');
    await writePrivateSnapshot(destination, fixture());
    assert.equal((await fs.stat(destination)).mode & 0o777, 0o600);
    assert.deepEqual(await readPrivateSnapshot(destination), fixture());
    await assert.rejects(writePrivateSnapshot(path.resolve('public/leaked-snapshot.json'), fixture()), { code: 'UNSAFE_SNAPSHOT_PATH' });
    await fs.symlink(path.resolve('public'), path.join(dir, 'unsafe'));
    await assert.rejects(writePrivateSnapshot(path.join(dir, 'unsafe', 'snapshot.json'), fixture()), { code: 'UNSAFE_SNAPSHOT_PATH' });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('service derives distinct orders, excludes the blocked SKU and keeps unknown values null', async () => {
  const service = createDashboardService({ loadSnapshot: async () => ({ data: fixture(), id: 'TEST-SNAPSHOT', captured_at: retrieved }) });
  const result = await service.getDashboard({});
  assert.equal(result.data_state, 'ready');
  assert.equal(result.kpis.orders, 3);
  assert.equal(result.kpis.appearances, 2);
  assert.equal(result.kpis.consumption_lines, 3);
  assert.equal(result.kpis.consumption_value, null);
  assert.equal(result.kpis.inventory_value, null);
  assert.equal(result.snapshot.id, 'TEST-SNAPSHOT');
  const filtered = await service.getDashboard({ sku: 'TEST-M' });
  assert.equal(filtered.kpis.orders, 1);
  assert.equal(filtered.kpis.appearances, 1);
});

test('service returns no fabricated dashboard for missing or unvalidated snapshots', async () => {
  const empty = createDashboardService({ loadSnapshot: async () => null });
  assert.equal(await empty.getDashboard(), null);
  assert.equal(await empty.getRows({ type: 'google_consumos' }), null);
  const unsafe = createDashboardService({ loadSnapshot: async () => ({ data: { tables: {}, sources: {} } }) });
  await assert.rejects(unsafe.getDashboard(), { code: 'INVALID_SNAPSHOT' });
});

test('row queries apply global filters, stable numeric sort and at most 200 rows', async () => {
  const service = createDashboardService({ loadSnapshot: async () => ({ data: fixture() }) });
  const result = await service.getRows({ type: 'google_consumos', sku: 'TEST-M', center: 'TEST-C', from: '2026-09-01', to: '2026-09-30', sort: 'quantity', dir: 'desc', offset: '1', limit: '999', q: 'TEST-T1' });
  assert.equal(result.limit, 200);
  assert.equal(result.total, 2);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].quantity, 2);
  assert.ok(!('_sheet_row' in result.rows[0]));
  assert.equal((await service.getRows({ type: 'google_consumos', month: '2026-10' })).total, 0);
});

test('query validation rejects malformed bounds and sorting before loading data', async () => {
  let loads = 0;
  const service = createDashboardService({ loadSnapshot: async () => { loads++; return null; } });
  for (const query of [
    { from: '2026-02-30' }, { from: '2026-10-31', to: '2026-10-01' }, { sku: 'x'.repeat(101) }, { month: '2026-13' }, { unknown: 'x' },
  ]) await assert.rejects(service.getDashboard(query), { code: 'INVALID_QUERY' });
  for (const query of [
    { type: 'customers' }, { type: 'google_consumos', sort: 'email' }, { type: 'google_consumos', offset: -1 },
    { type: 'google_consumos', offset: 'NaN' }, { type: 'google_consumos', dir: 'sideways' }, { type: 'google_consumos', limit: 0 },
  ]) await assert.rejects(service.getRows(query), { code: 'INVALID_QUERY' });
  assert.equal(loads, 0);
});

test('sync CLI dry-run validates privately without touching a database or printing rows', async () => {
  const { runSyncCloud } = await import('./sync-cloud.mjs');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'greencall-sync-test-'));
  try {
    const source = path.join(dir, 'snapshot.json');
    await writePrivateSnapshot(source, fixture());
    let writes = 0;
    const summary = await runSyncCloud({ argv: ['--from-file', source], env: {}, publish: async () => { writes++; } });
    assert.equal(summary.mode, 'validated_only');
    assert.equal(summary.row_counts.google_consumos, 4);
    assert.equal(writes, 0);
    assert.ok(!JSON.stringify(summary).includes('TEST-T1'));
    assert.ok(!JSON.stringify(summary).includes(source));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('sync CLI requires explicit write authorization and a development target', async () => {
  const { runSyncCloud } = await import('./sync-cloud.mjs');
  for (const env of [{}, { GREENCALL_ALLOW_SNAPSHOT_WRITE: '1' }, { GREENCALL_ALLOW_SNAPSHOT_WRITE: '1', GREENCALL_SNAPSHOT_ENV: 'production', DATABASE_URL: 'postgres://private' }]) {
    await assert.rejects(runSyncCloud({ argv: ['--from-file', '/private/test.json', '--apply'], env }), { code: 'SNAPSHOT_WRITE_DISABLED' });
  }
  await assert.rejects(runSyncCloud({ argv: ['--from-sheets', '--staging-dir', '/private/staging'], env: {} }), { code: 'SHEETS_CONFIG_REQUIRED' });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'greencall-sync-test-'));
  try {
    const source = path.join(dir, 'snapshot.json');
    await writePrivateSnapshot(source, fixture());
    let writes = 0;
    const summary = await runSyncCloud({ argv: ['--from-file', source, '--apply'], env: {
      GREENCALL_ALLOW_SNAPSHOT_WRITE: '1', GREENCALL_SNAPSHOT_ENV: 'development', DATABASE_URL: 'postgres://synthetic-development.invalid/test',
    }, getActiveSnapshotId: async () => null,
    publish: async (data, options) => { assert.equal(data.tables.google_consumos.length, 4); assert.equal(options.expectedSnapshotId, null); writes++; return { id: 'TEST-ID' }; } });
    assert.equal(summary.mode, 'published');
    assert.equal(summary.id, 'TEST-ID');
    assert.equal(writes, 1);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('production sync needs a second explicit flag and the least-privilege sync role', async () => {
  const { runSyncCloud } = await import('./sync-cloud.mjs');
  const base = { GREENCALL_ALLOW_SNAPSHOT_WRITE: '1', GREENCALL_SNAPSHOT_ENV: 'production' };
  for (const env of [
    { ...base, GREENCALL_SYNC_DATABASE_URL: 'postgres://gc_sheets_sync:x@synthetic.invalid/db' },                                  // missing second flag
    { ...base, GREENCALL_ALLOW_PRODUCTION_SNAPSHOT: '1', DATABASE_URL: 'postgres://gc_dashboard_read:x@synthetic.invalid/db' },     // no sync role URL
    { ...base, GREENCALL_ALLOW_PRODUCTION_SNAPSHOT: '1', GREENCALL_SYNC_DATABASE_URL: 'postgres://neondb_owner:x@synthetic.invalid/db' }, // owner refused
  ]) await assert.rejects(runSyncCloud({ argv: ['--from-file', '/private/test.json', '--apply'], env }), { code: 'SNAPSHOT_WRITE_DISABLED' });
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'greencall-sync-test-'));
  try {
    const source = path.join(dir, 'snapshot.json');
    await writePrivateSnapshot(source, fixture());
    let target = null;
    const summary = await runSyncCloud({ argv: ['--from-file', source, '--apply'], env: { ...base, GREENCALL_ALLOW_PRODUCTION_SNAPSHOT: '1', GREENCALL_SYNC_DATABASE_URL: 'postgres://gc_sheets_sync:x@synthetic.invalid/db', DATABASE_URL: 'postgres://gc_dashboard_read:x@synthetic.invalid/db' },
      getActiveSnapshotId: async ({ env }) => { assert.match(env.DATABASE_URL, /gc_sheets_sync/); return null; },
      publish: async (data, options) => { target = options.env.DATABASE_URL; return { id: 'TEST-PROD' }; } });
    assert.equal(summary.mode, 'published');
    assert.match(target, /gc_sheets_sync/, 'publication uses the sync role, never the read role');
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

test('loading fetches chunks concurrently (bounded) and still rejects a tampered chunk', async () => {
  const adapter = memoryAdapter();
  const repository = createSnapshotRepository(adapter);
  const big = fixture();
  // Enough synthetic rows for several chunks.
  big.tables.google_consumos = Array.from({ length: 6000 }, (_, i) => ({ order: 'TEST-' + i, sku: 'TEST-M', quantity: 1, date: '2026-09-01', tech: 'TEST-T1', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: i + 2 }));
  big.sources.google_consumos.original_data_rows = 6000;
  await repository.publishSnapshot(big, { capturedAt: retrieved });
  let inFlight = 0, peak = 0;
  const slow = createSnapshotRepository({ ...adapter, query: async (text, values) => {
    if (!/FROM greencall_private\.snapshot_chunks/.test(text)) return adapter.query(text, values);
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise(r => setTimeout(r, 20));
    try { return await adapter.query(text, values); } finally { inFlight--; }
  } });
  assert.equal((await slow.loadSnapshot()).data.tables.google_consumos.length, 6000);
  assert.ok(peak > 1 && peak <= 8, 'chunk reads overlap, bounded at 8 (peak ' + peak + ')');
  const tampering = createSnapshotRepository({ ...adapter, query: async (text, values) => {
    const result = await adapter.query(text, values);
    if (/FROM greencall_private\.snapshot_chunks/.test(text) && values[2] === 1) return result.map(r => ({ ...r, rows: r.rows.map((x, i) => i === 0 ? { ...x, quantity: 2 } : x) }));
    return result;
  } });
  await assert.rejects(tampering.loadSnapshot(), { code: 'INVALID_SNAPSHOT' });
});
