/** Cloud physical-count import: parse, validate, preview and plan an append-only batch.
 * Pure functions only (no I/O). The habitual physical-count Excel is the only manual
 * load; Google Sheets is never written. Effective counts are a deterministic replay of
 * legacy rows plus every non-reverted batch, so a revert restores prior values exactly.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { detect, ingestRows, mergeRows } from '../src/core.mjs';
import { readWorkbook } from '../src/xlsx.mjs';
import { sanitizeSnapshot } from './snapshot-store.mjs';

export const PHYSICAL_LIMITS = Object.freeze({ maxBytes: 4 * 1024 * 1024, maxInflatedBytes: 64 * 1024 * 1024, maxRows: 20_000, maxIssues: 500, maxChanges: 200 });
export const PHYSICAL_SOURCE_TYPE = 'PRIVATE_PHYSICAL_COUNT_XLSX';
const EXCLUDED_SKUS = new Set(['7005189']);
const PIECE_UNITS = new Set(['PZA', 'PZ', 'PIEZA', 'PIEZAS', 'UND', 'UN', 'UNIDAD', 'UNIDADES', 'EA']);

export class PhysicalImportError extends Error {
  constructor(code, message, status = 400) { super(message); this.name = 'PhysicalImportError'; this.code = code; this.status = status; }
}
const fail = (code, message, status) => new PhysicalImportError(code, message, status);
const text = value => String(value ?? '').trim();
const normHeader = value => text(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const keyOf = r => [r.take, r.date, r.tech, r.sku].map(v => text(v).toUpperCase()).join('|');
const affirmative = value => /^(si|sí|s|yes|y|true|1|x)$/i.test(text(value));

export function safeFilename(name) {
  const base = path.basename(String(name || 'toma.xlsx').replaceAll('\\', '/'));
  return base.normalize('NFC').replace(/[^\p{L}\p{N} ._()-]/gu, '_').replace(/^\.+/, '').slice(0, 120) || 'toma.xlsx';
}

export function physicalBatchId(action, ...parts) {
  const hash = crypto.createHash('sha256').update(['greencall-physical-v1', action, ...parts.map(p => p ?? 'none')].join('|')).digest('hex');
  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');
}

/** Reads only sheets whose headers match the physical-count contract. */
export function parsePhysicalFile(buffer, filename) {
  const name = safeFilename(filename);
  if (!/\.(xlsx|xlsm|csv)$/i.test(name)) throw fail('UNSUPPORTED_FORMAT', 'Formato admitido: XLSX, XLSM o CSV.', 415);
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw fail('EMPTY_FILE', 'El archivo está vacío.');
  if (buffer.length > PHYSICAL_LIMITS.maxBytes) throw fail('FILE_TOO_LARGE', 'El archivo supera 4 MiB; divida la toma física por técnico o fecha.', 413);
  let sheets;
  try { sheets = readWorkbook(buffer, name, { maxInflatedBytes: PHYSICAL_LIMITS.maxInflatedBytes, maxEntries: 300 }); }
  catch (error) {
    if (error?.code === 'XLSX_LIMIT') throw fail('FILE_TOO_LARGE', 'El contenido descomprimido del libro supera el límite seguro; divida la toma física.', 413);
    throw fail('UNREADABLE_FILE', 'No se pudo leer el libro; guárdelo de nuevo como XLSX.');
  }
  const rows = [], used = [], ignored = [];
  for (const sheet of sheets) {
    let detected = null;
    try { detected = sheet.rows.length >= 2 ? detect(sheet.rows) : null; } catch { detected = null; }
    if (detected?.type !== 'physical_counts') { ignored.push(String(sheet.sheet).slice(0, 100)); continue; }
    const header = sheet.rows[detected.headerRow], dateColumn = header.findIndex(h => normHeader(h) === 'fecha');
    used.push(String(sheet.sheet).slice(0, 100));
    for (let i = detected.headerRow + 1; i < sheet.rows.length; i++) {
      const raw = sheet.rows[i] || [];
      if (!raw.some(v => text(v) !== '')) continue;
      const [parsed = {}] = ingestRows([header, raw], 'physical_counts', 0);
      rows.push({ ...parsed, _sheet: used.at(-1), _row: i + 1, _raw_date: dateColumn >= 0 ? text(raw[dateColumn]) : '' });
      if (rows.length > PHYSICAL_LIMITS.maxRows) throw fail('TOO_MANY_ROWS', 'La toma supera 20.000 filas; divídala en varios archivos.', 413);
    }
  }
  if (!used.length) throw fail('NO_PHYSICAL_SHEET', 'El libro no contiene una hoja con el formato de toma física (Toma, Fecha, Código técnico, SKU, Conteo físico).');
  return { sha256: crypto.createHash('sha256').update(buffer).digest('hex'), filename: name, size: buffer.length, sheets: used, ignored_sheets: ignored, rows };
}

export function effectivePhysicalCounts(legacyRows, batches) {
  return batches.reduce((rows, batch) => mergeRows(rows, batch.rows, 'physical_counts').rows, mergeRows([], legacyRows || [], 'physical_counts').rows);
}

function latestByTechSku(rows) {
  const latest = new Map();
  for (const r of rows) {
    if (text(r.status).toUpperCase() === 'ANNULLED' || !r.date || r.count === null || r.count < 0) continue;
    const k = r.tech + '|' + r.sku, before = latest.get(k);
    if (!before || r.date > before.date || r.date === before.date && text(r.take) >= text(before.take)) latest.set(k, r);
  }
  return latest;
}

// Keep the existing provenance label: it is part of the content hash, so a revert
// back to the legacy rows reactivates the exact original immutable snapshot.
const physicalSource = (data, rows, now) => {
  const previous = data.sources?.physical_counts;
  const tab = previous ? previous.source_tab : 'Toma física (Cloud)';
  return { source_type: PHYSICAL_SOURCE_TYPE, ...(tab === undefined ? {} : { source_tab: tab }), original_data_rows: rows, retrieved_at: now, sanitized: true };
};
const strip = r => Object.fromEntries(Object.entries(r).filter(([k, v]) => !k.startsWith('_') && v !== undefined && !(k === 'invalid_negative_count' && v === false)));

/** Builds the preview and, when there are no blocking errors, the next snapshot data. */
export function planPhysicalImport({ data, parsed, batches, batchId, today, now }) {
  const existing = data.tables.physical_counts || [];
  const known = new Set(batches.map(b => b.id));
  if (existing.some(r => r.import_batch && !known.has(r.import_batch))) throw fail('LEDGER_MISMATCH', 'El snapshot activo contiene conteos de un lote que no está en la bitácora; no se importará hasta reconciliar.', 409);
  const legacy = existing.filter(r => !r.import_batch);
  const current = effectivePhysicalCounts(legacy, batches);
  const currentByKey = new Map(current.map(r => [keyOf(r), r]));
  const latest = latestByTechSku(current);
  const units = new Map();
  for (const r of data.tables.sku_catalog || []) if (r.sku) { const set = units.get(r.sku) || new Set(); if (text(r.unit)) set.add(text(r.unit).toUpperCase()); units.set(r.sku, set); }
  const techs = new Set((data.tables.technicians || []).map(r => r.tech).filter(Boolean));
  const issues = [];
  const issue = (r, severity, code, field, message) => issues.push({ sheet: r._sheet, row: r._row, severity, code, field, message });
  const seen = new Map(), accepted = [];
  let duplicates = 0;
  for (const r of parsed.rows) {
    const before = issues.length;
    const error = (code, field, message) => issue(r, 'error', code, field, message);
    if (!r.date) r._raw_date ? error('INVALID_DATE', 'Fecha', 'Fecha inválida: ' + r._raw_date.slice(0, 40)) : error('MISSING_DATE', 'Fecha', 'Falta la fecha del conteo.');
    else if (today && r.date > today) error('FUTURE_DATE', 'Fecha', 'La fecha ' + r.date + ' es posterior al día de hoy.');
    if (!text(r.tech)) error('MISSING_TECH', 'Código técnico', 'Falta el código del técnico o ubicación.');
    if (!text(r.sku)) error('MISSING_SKU', 'SKU', 'Falta el SKU.');
    else if (EXCLUDED_SKUS.has(text(r.sku))) error('EXCLUDED_SKU', 'SKU', 'El SKU ' + r.sku + ' está excluido de métricas de materiales.');
    const unitSet = units.get(r.sku);
    if (r.count === null || r.count === undefined) error('MISSING_COUNT', 'Conteo físico', 'Falta el conteo físico (use 0 si no hay existencias).');
    else if (r.count < 0) error('NEGATIVE_COUNT', 'Conteo físico', 'El conteo no puede ser negativo.');
    else if (unitSet?.size === 1 && PIECE_UNITS.has([...unitSet][0]) && !Number.isInteger(r.count)) error('FRACTIONAL_PIECES', 'Conteo físico', 'El SKU se mide en ' + [...unitSet][0] + '; el conteo debe ser entero.');
    if (issues.length > before) continue;
    const k = keyOf(r), prior = seen.get(k);
    if (prior) {
      if (prior.count !== r.count) error('CONFLICTING_DUPLICATE', 'Conteo físico', 'Fila repetida (toma/fecha/técnico/SKU) con conteo distinto a la fila ' + prior._row + '.');
      else { duplicates++; issue(r, 'warning', 'DUPLICATE_ROW', 'Toma', 'Fila idéntica a la fila ' + prior._row + '; se ignora.'); }
      continue;
    }
    seen.set(k, r);
    if (!unitSet) issue(r, 'warning', 'UNKNOWN_SKU', 'SKU', 'SKU fuera del Catálogo SKUs; costo y unidad no verificables.');
    else if (!unitSet.size) issue(r, 'warning', 'UNIT_UNCONFIRMED', 'SKU', 'El catálogo no define unidad para este SKU.');
    else if (unitSet.size > 1) issue(r, 'warning', 'UNIT_AMBIGUOUS', 'SKU', 'El catálogo tiene varias unidades: ' + [...unitSet].join(', ') + '.');
    if (techs.size && !techs.has(r.tech)) issue(r, 'warning', 'UNKNOWN_TECH', 'Código técnico', 'Técnico o ubicación fuera de la tabla Tecnicos.');
    if (affirmative(r.serialized)) issue(r, 'warning', 'SERIALIZED_AGGREGATE', 'Serializado', 'Se registra como conteo agregado; no prueba series individuales.');
    accepted.push(r);
  }
  const errors = issues.filter(i => i.severity === 'error').length;
  const changes = [], batchRows = [], byUnit = new Map();
  let added = 0, updated = 0, unchanged = 0;
  for (const r of accepted) {
    const clean = strip(r), previousSame = currentByKey.get(keyOf(r)), previous = latest.get(r.tech + '|' + r.sku);
    const unitSet = units.get(r.sku), unit = unitSet?.size === 1 ? [...unitSet][0] : 'SIN UNIDAD CONFIRMADA';
    // Same reading = same count and status; descriptive columns alone are not a correction.
    const sameContent = previousSame && previousSame.count === r.count && text(previousSame.status).toUpperCase() === text(r.status).toUpperCase();
    const change = !previousSame ? 'NUEVO' : sameContent ? 'SIN_CAMBIO' : 'ACTUALIZA';
    if (change === 'NUEVO') added++; else if (change === 'ACTUALIZA') updated++; else unchanged++;
    if (change !== 'SIN_CAMBIO') batchRows.push({ ...clean, import_batch: batchId });
    const u = byUnit.get(unit) || { unit, rows: 0, quantity: 0 }; u.rows++; u.quantity += r.count; byUnit.set(unit, u);
    if (changes.length < PHYSICAL_LIMITS.maxChanges) changes.push({ row: r._row, sheet: r._sheet, take: r.take || null, date: r.date, tech: r.tech, tech_name: r.tech_name || null, sku: r.sku, description: r.description || null, unit, count: r.count, previous_count: previous?.count ?? null, previous_date: previous?.date ?? null, change });
  }
  const dates = accepted.map(r => r.date).sort();
  const stats = {
    rows_read: parsed.rows.length, valid: accepted.length, errors, warnings: issues.length - errors,
    new: added, updated, unchanged, duplicates_in_file: duplicates,
    technicians: new Set(accepted.map(r => r.tech)).size, skus: new Set(accepted.map(r => r.sku)).size,
    date_min: dates[0] || null, date_max: dates.at(-1) || null,
    by_unit: [...byUnit.values()].sort((a, b) => a.unit.localeCompare(b.unit)),
  };
  const noChanges = !errors && !batchRows.length;
  const preview = {
    can_apply: !errors && !noChanges,
    blocked_reason: errors ? 'VALIDATION_FAILED' : noChanges ? 'NO_CHANGES' : null,
    file: { sha256: parsed.sha256, filename: parsed.filename, size: parsed.size, sheets: parsed.sheets, ignored_sheets: parsed.ignored_sheets },
    stats, issues: issues.slice(0, PHYSICAL_LIMITS.maxIssues), issues_truncated: issues.length > PHYSICAL_LIMITS.maxIssues,
    changes, changes_truncated: accepted.length > changes.length,
  };
  if (!preview.can_apply) return { preview, next: null, batch: null };
  const physical = effectivePhysicalCounts(legacy, [...batches, { id: batchId, rows: batchRows }]);
  const next = { tables: { ...data.tables, physical_counts: physical }, sources: { ...data.sources, physical_counts: physicalSource(data, physical.length, now) } };
  try { sanitizeSnapshot(next); } catch { throw fail('UNSAFE_CONTENT', 'El archivo contiene texto no permitido (datos personales, credenciales o campos demasiado largos).'); }
  return { preview, next, batch: { id: batchId, action: 'IMPORT', file_sha256: parsed.sha256, filename: parsed.filename, rows: batchRows, stats: { ...stats, by_unit: stats.by_unit } } };
}

/** Plan for reverting one batch: replay every other non-reverted batch. */
export function planPhysicalRevert({ data, batches, batchId, revertId, now }) {
  const existing = data.tables.physical_counts || [];
  const known = new Set(batches.map(b => b.id));
  if (!known.has(batchId)) throw fail('BATCH_NOT_ACTIVE', 'El lote no existe o ya fue revertido.', 409);
  if (existing.some(r => r.import_batch && !known.has(r.import_batch))) throw fail('LEDGER_MISMATCH', 'El snapshot activo no coincide con la bitácora de tomas físicas.', 409);
  const physical = effectivePhysicalCounts(existing.filter(r => !r.import_batch), batches.filter(b => b.id !== batchId));
  const tables = { ...data.tables }, sources = { ...data.sources };
  if (physical.length) { tables.physical_counts = physical; sources.physical_counts = physicalSource(data, physical.length, now); }
  else { delete tables.physical_counts; delete sources.physical_counts; }
  const removed = existing.filter(r => r.import_batch === batchId).length;
  return { next: { tables, sources }, batch: { id: revertId, action: 'REVERT', reverts_batch: batchId, rows: [], stats: { rows_removed: removed, rows_after: physical.length } } };
}
