import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXlsx, PHYSICAL_HEADER } from './test-xlsx.mjs';
import { sanitizeSnapshot } from '../lib/snapshot-store.mjs';
import { analyze } from '../src/core.mjs';

const mod = await import('../lib/physical-import.mjs').catch(() => ({}));
const { parsePhysicalFile, planPhysicalImport, effectivePhysicalCounts, physicalBatchId, PHYSICAL_LIMITS } = mod;

// Every record below is a synthetic contract fixture, never operational data.
const today = '2026-10-31';
const retrieved = '2026-10-30T12:00:00.000Z';
function base() {
  const tables = {
    google_consumos: [
      { order: 'TEST-1', sku: 'TEST-M', quantity: 3, date: '2026-09-01', tech: 'TEST-T1', center: 'TEST-C', warehouse: 'TEST-W', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 2 },
      { order: 'TEST-2', sku: 'TEST-P', quantity: 1, date: '2026-09-02', tech: 'TEST-T2', center: 'TEST-C', warehouse: 'TEST-W', source_mode: 'GOOGLE_CONSUMOS', _sheet_row: 3 },
    ],
    sku_catalog: [
      { sku: 'TEST-M', description: 'Synthetic material in meters', cost: 4, unit: 'M', center: 'TEST-C', warehouse: 'TEST-W' },
      { sku: 'TEST-P', description: 'Synthetic pieces', cost: null, unit: 'PZA', center: 'TEST-C', warehouse: 'TEST-W' },
    ],
  };
  const tabs = { google_consumos: 'Consumos', sku_catalog: 'Catálogo SKUs' };
  const data = { tables, sources: Object.fromEntries(Object.entries(tables).map(([type, rows]) => [type, { source_type: 'GOOGLE_SHEETS_API_READ_ONLY', source_tab: tabs[type], original_data_rows: rows.length, retrieved_at: retrieved, sanitized: true }])) };
  data.tables.technicians = [{ tech: 'TEST-T1', name: 'Synthetic Tech One', status: 'ACTIVO' }, { tech: 'TEST-T2', name: 'Synthetic Tech Two', status: 'ACTIVO' }];
  data.sources.technicians = { source_type: 'GOOGLE_SHEETS_API_READ_ONLY', source_tab: 'Tecnicos', original_data_rows: 2, retrieved_at: '2026-10-30T12:00:00.000Z', sanitized: true };
  return data;
}
const row = (over = {}) => {
  const r = { take: 'TEST-TAKE-1', kind: 'Mensual', status: '', date: '2026-10-15', tech_name: 'Synthetic Tech One', tech: 'TEST-T1', sku: 'TEST-M', description: 'Synthetic material in meters', serialized: 'No', count: 7.5, ...over };
  return [r.take, r.kind, r.status, r.date, '', r.tech_name, r.tech, r.sku, r.description, r.serialized, r.count, '', '', ''];
};
const book = (...rows) => buildXlsx([{ name: 'Toma física', rows: [PHYSICAL_HEADER, ...rows] }]);

test('module exposes the physical import contract', () => {
  for (const fn of [parsePhysicalFile, planPhysicalImport, effectivePhysicalCounts, physicalBatchId]) assert.equal(typeof fn, 'function');
  assert.ok(PHYSICAL_LIMITS.maxBytes <= 4 * 1024 * 1024, 'stays under the Vercel request body limit');
});

test('parses the habitual Excel keeping exact source rows and file hash', () => {
  const buffer = book(row(), row({ sku: 'TEST-P', description: 'Synthetic pieces', count: 4 }));
  const parsed = parsePhysicalFile(buffer, 'Toma Octubre.xlsx');
  assert.match(parsed.sha256, /^[a-f0-9]{64}$/);
  assert.equal(parsed.filename, 'Toma Octubre.xlsx');
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows.map(r => [r._sheet, r._row, r.sku, r.count]), [['Toma física', 2, 'TEST-M', 7.5], ['Toma física', 3, 'TEST-P', 4]]);
});

test('rejects unsupported, oversized and non-physical workbooks explicitly', () => {
  assert.throws(() => parsePhysicalFile(Buffer.from('x'), 'toma.xls'), { code: 'UNSUPPORTED_FORMAT' });
  assert.throws(() => parsePhysicalFile(Buffer.alloc(PHYSICAL_LIMITS.maxBytes + 1), 'toma.xlsx'), { code: 'FILE_TOO_LARGE' });
  assert.throws(() => parsePhysicalFile(Buffer.from('not a zip'), 'toma.xlsx'), { code: 'UNREADABLE_FILE' });
  const other = buildXlsx([{ name: 'Otra', rows: [['Orden', 'SKU', 'Cantidad'], ['TEST-1', 'TEST-M', 1]] }]);
  assert.throws(() => parsePhysicalFile(other, 'otra.xlsx'), { code: 'NO_PHYSICAL_SHEET' });
  const unsafe = parsePhysicalFile(book(row()), '../../etc/<script>.xlsx');
  assert.ok(!/[\/<>]/.test(unsafe.filename));
});

test('row errors are isolated by row and field; blanks, ANNULLED and the excluded SIM are informative', () => {
  const parsed = parsePhysicalFile(book(
    row({ date: '' }),                                  // 2 missing date
    row({ date: '2026-02-30' }),                        // 3 invalid date
    row({ date: '2026-12-01' }),                        // 4 future date
    row({ tech: '', tech_name: '' }),                   // 5 missing technician
    row({ sku: '' }),                                   // 6 missing SKU
    row({ count: '' }),                                 // 7 blank count = NOT MEASURED (informative)
    row({ count: -2 }),                                 // 8 negative
    row({ sku: 'TEST-P', count: 2.5 }),                 // 9 fractional pieces
    row({ sku: '7005189' }),                            // 10 excluded SKU (policy, informative)
    row({ take: 'DUP', count: 1 }), row({ take: 'DUP', count: 2 }), // 11-12 conflicting duplicate
    row({ status: 'ANNULLED', count: 4 }),              // 13 annulled form (informative, never a count)
  ), 'errores.xlsx');
  const { preview, next } = planPhysicalImport({ data: base(), parsed, batches: [], batchId: physicalBatchId('IMPORT', parsed.sha256, null), today, now: '2026-10-31T18:00:00.000Z' });
  assert.equal(next, null, 'no valid observation left');
  assert.equal(preview.can_apply, false); assert.equal(preview.blocked_reason, 'VALIDATION_FAILED');
  const errors = preview.issues.filter(i => i.severity === 'error').map(i => [i.row, i.code]);
  for (const expected of [[2, 'MISSING_DATE'], [3, 'INVALID_DATE'], [4, 'FUTURE_DATE'], [5, 'MISSING_TECH'], [6, 'MISSING_SKU'], [8, 'NEGATIVE_COUNT'], [9, 'FRACTIONAL_PIECES'], [12, 'CONFLICTING_DUPLICATE']])
    assert.ok(errors.some(([r, c]) => r === expected[0] && c === expected[1]), 'expected ' + expected.join(':'));
  assert.ok(!errors.some(([r]) => [7, 10, 13].includes(r)), 'informative rows are not errors');
  assert.deepEqual(preview.stats.ignored, { not_measured: 1, annulled: 1, excluded_policy: 1, total: 3 });
  assert.ok(preview.issues.every(i => typeof i.message === 'string' && i.sheet === 'Toma física'));
});

test('partial safe import: valid observations apply even when other rows are rejected', () => {
  const parsed = parsePhysicalFile(book(row({ count: 3 }), row({ count: -1, take: 'BAD' }), row({ count: '' , take: 'BLANK' })), 'parcial.xlsx');
  const { preview, next, batch } = planPhysicalImport({ data: base(), parsed, batches: [], batchId: physicalBatchId('IMPORT', parsed.sha256, null), today, now: '2026-10-31T18:00:00.000Z' });
  assert.equal(preview.can_apply, true); assert.equal(preview.partial, true);
  assert.equal(preview.stats.valid, 1); assert.equal(preview.stats.rejected, 1); assert.equal(preview.stats.ignored.not_measured, 1);
  assert.equal(batch.rows.length, 1); assert.equal(next.tables.physical_counts[0].count, 3);
});

// Synthetic fixture with the REAL autoconteo export structure (15 columns incl. Responsable,
// Excel serial dates, EXPIRED/ANNULLED form states). No operational values.
const AUTO_HEADER = ['Toma', 'Tipo', 'Estado', 'Fecha', 'Vence', 'Técnico', 'Código técnico', 'Responsable', 'SKU', 'Descripción', 'Serializado', 'Conteo físico', 'Referencia ETA', 'Diferencia', 'Resultado'];
const serial = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 86400000) + 25569;
const auto = o => [o.take, 'Autoconteo', o.status, serial(o.date), serial(o.date) + 3, 'Synthetic Tech', o.tech, 'Synthetic Supervisor', o.sku, o.desc || 'Synthetic', 'No', o.count ?? '', '', '', ''];
test('autoconteo export: EXPIRED with a count is valid, 0 is valid, blanks are not measured, latest count wins', () => {
  const parsed = parsePhysicalFile(buildXlsx([{ name: 'Tomas de inventario', rows: [AUTO_HEADER,
    auto({ take: 'A1', status: 'EXPIRED', date: '2026-09-14', tech: 'TEST-T1', sku: 'TEST-P', count: 9 }),
    auto({ take: 'A2', status: 'EXPIRED', date: '2026-10-01', tech: 'TEST-T1', sku: 'TEST-P', count: 4 }),
    auto({ take: 'A3', status: 'EXPIRED', date: '2026-10-20', tech: 'TEST-T1', sku: 'TEST-P', count: 0 }),
    auto({ take: 'A4', status: 'EXPIRED', date: '2026-10-29', tech: 'TEST-T1', sku: 'TEST-P' }),            // unanswered form, later date
    auto({ take: 'A5', status: 'ANNULLED', date: '2026-10-25', tech: 'TEST-T1', sku: 'TEST-P' }),
    auto({ take: 'A6', status: 'EXPIRED', date: '2026-10-20', tech: 'TEST-T2', sku: 'TENSORES', desc: 'TENSOR', count: 120 }),
    auto({ take: 'A7', status: 'EXPIRED', date: '2026-10-20', tech: 'TEST-T2', sku: 'PEND-UTP-EXTERIOR', desc: 'UTP PARA EXTERIORES', count: 35.5 }),
  ] }]), 'tomas_autoconteo.xlsx');
  assert.equal(parsed.rows.length, 7);
  assert.ok(!('responsible' in parsed.rows[0]) && !Object.values(parsed.rows[0]).includes('Synthetic Supervisor'), 'Responsable is not stored');
  const { preview, next } = planPhysicalImport({ data: base(), parsed, batches: [], batchId: physicalBatchId('IMPORT', parsed.sha256, null), today, now: '2026-10-31T18:00:00.000Z' });
  assert.equal(preview.can_apply, true);
  assert.equal(preview.stats.with_count, 5); assert.equal(preview.stats.valid, 5);
  assert.deepEqual(preview.stats.ignored, { not_measured: 1, annulled: 1, excluded_policy: 0, total: 2 });
  assert.equal(preview.stats.date_max, '2026-10-20'); assert.equal(preview.stats.pairs, 3); assert.equal(preview.stats.pairs_multiple, 1);
  const units = Object.fromEntries(preview.changes.map(c => [c.sku, c.unit]));
  assert.deepEqual(units, { 'TEST-P': 'PZA', TENSORES: 'PZA', 'PEND-UTP-EXTERIOR': 'M' }, 'units from the resolver, never SIN UNIDAD');
  assert.equal(next.tables.physical_counts.length, 5, 'history is append-only: every dated count is kept');
  const latest = analyze(sanitizeSnapshot(next), {}, {}).physical.latest.find(r => r.tech === 'TEST-T1' && r.sku === 'TEST-P');
  assert.equal(latest.count, 0, 'explicit 0 on the latest measured date wins; the unanswered later form does not');
});

test('warnings keep rows importable but visible', () => {
  const parsed = parsePhysicalFile(book(
    row({ sku: 'TEST-NEW', description: 'Synthetic unknown' }),
    row({ tech: 'TEST-T9', tech_name: 'Synthetic unknown tech' }),
    row({ serialized: 'Si' }),
    row({ take: 'SAME' }), row({ take: 'SAME' }),
  ), 'avisos.xlsx');
  const { preview, next } = planPhysicalImport({ data: base(), parsed, batches: [], batchId: physicalBatchId('IMPORT', parsed.sha256, null), today, now: '2026-10-31T18:00:00.000Z' });
  assert.equal(preview.can_apply, true);
  const codes = preview.issues.map(i => i.code);
  for (const code of ['UNKNOWN_SKU', 'UNKNOWN_TECH', 'SERIALIZED_AGGREGATE', 'DUPLICATE_ROW']) assert.ok(codes.includes(code), code);
  assert.equal(preview.stats.duplicates_in_file, 1);
  assert.equal(next.tables.physical_counts.length, 4);
});

test('preview compares against current effective counts and never mixes units', () => {
  const data = base();
  data.tables.physical_counts = [{ take: 'OLD', date: '2026-09-30', tech: 'TEST-T1', sku: 'TEST-M', count: 3 }];
  data.sources.physical_counts = { source_type: 'PRIVATE_PHYSICAL_COUNT_XLSX', original_data_rows: 1, retrieved_at: '2026-10-01T00:00:00.000Z', sanitized: true };
  const parsed = parsePhysicalFile(book(
    row({ take: 'OLD', date: '2026-09-30', count: 3 }),        // unchanged
    row({ take: 'NEW', count: 9 }),                              // new reading for TEST-T1/TEST-M
    row({ take: 'NEW', sku: 'TEST-P', description: 'Synthetic pieces', count: 5 }),
  ), 'comparacion.xlsx');
  const { preview } = planPhysicalImport({ data, parsed, batches: [], batchId: physicalBatchId('IMPORT', parsed.sha256, null), today, now: '2026-10-31T18:00:00.000Z' });
  assert.equal(preview.stats.unchanged, 1);
  assert.equal(preview.stats.new, 2);
  const m = preview.changes.find(c => c.sku === 'TEST-M' && c.take === 'NEW');
  assert.equal(m.previous_count, 3); assert.equal(m.previous_date, '2026-09-30'); assert.equal(m.unit, 'M');
  assert.deepEqual(preview.stats.by_unit.map(u => [u.unit, u.quantity]).sort(), [['M', 12], ['PZA', 5]]);
});

test('apply plan keeps other tables intact and records private spreadsheet provenance', () => {
  const data = base();
  const parsed = parsePhysicalFile(book(row()), 'toma.xlsx');
  const batchId = physicalBatchId('IMPORT', parsed.sha256, null);
  const { next, batch } = planPhysicalImport({ data, parsed, batches: [], batchId, today, now: '2026-10-31T18:00:00.000Z' });
  assert.deepEqual(next.tables.google_consumos, data.tables.google_consumos);
  assert.deepEqual(next.tables.sku_catalog, data.tables.sku_catalog);
  assert.equal(next.sources.physical_counts.source_type, 'PRIVATE_PHYSICAL_COUNT_XLSX');
  assert.equal(next.sources.physical_counts.original_data_rows, 1);
  assert.equal(next.tables.physical_counts[0].import_batch, batchId);
  assert.ok(!Object.keys(next.tables.physical_counts[0]).some(k => k.startsWith('_')), 'source row metadata stays out of the snapshot');
  assert.equal(batch.id, batchId); assert.equal(batch.rows.length, 1); assert.equal(batch.file_sha256, parsed.sha256);
  sanitizeSnapshot(next);
  const dashboard = analyze(next, {}, {});
  assert.equal(dashboard.physical.latest.find(r => r.sku === 'TEST-M').count, 7.5);
});

test('effective counts replay non-reverted batches so a revert restores earlier values', () => {
  const legacy = [{ take: 'L', date: '2026-09-01', tech: 'TEST-T1', sku: 'TEST-M', count: 1 }];
  const a = { id: '00000000-0000-4000-8000-00000000000a', rows: [{ take: 'K', date: '2026-10-01', tech: 'TEST-T1', sku: 'TEST-M', count: 5, import_batch: '00000000-0000-4000-8000-00000000000a' }] };
  const b = { id: '00000000-0000-4000-8000-00000000000b', rows: [{ take: 'K', date: '2026-10-01', tech: 'TEST-T1', sku: 'TEST-M', count: 6, import_batch: '00000000-0000-4000-8000-00000000000b' }] };
  assert.deepEqual(effectivePhysicalCounts(legacy, [a, b]).map(r => r.count), [1, 6]);
  assert.deepEqual(effectivePhysicalCounts(legacy, [a]).map(r => r.count), [1, 5]);
  assert.deepEqual(effectivePhysicalCounts(legacy, []).map(r => r.count), [1]);
});

test('snapshot rows tagged with a batch absent from the ledger stop the import', () => {
  const data = base();
  data.tables.physical_counts = [{ take: 'X', date: '2026-10-01', tech: 'TEST-T1', sku: 'TEST-M', count: 2, import_batch: '00000000-0000-4000-8000-0000000000ff' }];
  data.sources.physical_counts = { source_type: 'PRIVATE_PHYSICAL_COUNT_XLSX', original_data_rows: 1, retrieved_at: '2026-10-01T00:00:00.000Z', sanitized: true };
  const parsed = parsePhysicalFile(book(row()), 'toma.xlsx');
  assert.throws(() => planPhysicalImport({ data, parsed, batches: [], batchId: physicalBatchId('IMPORT', parsed.sha256, null), today, now: '2026-10-31T18:00:00.000Z' }), { code: 'LEDGER_MISMATCH' });
});

test('batch identities are deterministic for idempotent retries', () => {
  const sha = 'a'.repeat(64);
  assert.equal(physicalBatchId('IMPORT', sha, null), physicalBatchId('IMPORT', sha, null));
  assert.notEqual(physicalBatchId('IMPORT', sha, null), physicalBatchId('IMPORT', sha, '00000000-0000-4000-8000-000000000001'));
  assert.match(physicalBatchId('REVERT', physicalBatchId('IMPORT', sha, null)), /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
});

test('decompression bombs are refused before exhausting memory', () => {
  const padding = ' '.repeat(80 * 1024 * 1024);
  const xml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${padding}</sheetData></worksheet>`;
  const bomb = buildXlsx([{ name: 'Toma', xml }], { deflate: true });
  assert.ok(bomb.length < PHYSICAL_LIMITS.maxBytes, 'the bomb fits under the upload limit');
  const started = Date.now();
  assert.throws(() => parsePhysicalFile(bomb, 'bomba.xlsx'), { code: 'FILE_TOO_LARGE' });
  assert.ok(Date.now() - started < 3000, 'rejected quickly');
});

test('absurd column references cannot create giant sparse rows', () => {
  const xml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="ZZZZZZ1" t="inlineStr"><is><t>x</t></is></c></row></sheetData></worksheet>`;
  const started = Date.now();
  assert.throws(() => parsePhysicalFile(buildXlsx([{ name: 'Toma', xml }]), 'columnas.xlsx'), { code: 'UNREADABLE_FILE' });
  assert.ok(Date.now() - started < 1000);
});
