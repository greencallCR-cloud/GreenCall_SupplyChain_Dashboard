/** Private, validated analytics snapshots. Never import this module in browser code. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fields } from '../src/core.mjs';
import { SOURCE_TABS } from '../src/sheets-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_ROWS = 2_000_000;
export const MAX_CHUNK_BYTES = 1024 * 1024;
const validated = new WeakSet();
const tabs = Object.fromEntries(SOURCE_TABS.map(({ type, tab }) => [type, tab]));
const numericFields = new Set(['quantity', 'count', 'cost', 'value', 'subtotal', 'tax', 'days', 'difference', 'eta_matches', 'eta_ref']);
const dateFields = new Set(['date', 'cut', 'eta_cut', 'sap_cut', 'dispatch_date', 'installed', 'expiration']);
const secretValue = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:Bearer\s+[A-Za-z0-9._~-]{12,}|postgres(?:ql)?:\/\/|sk-proj-[A-Za-z0-9_-]+)/i;
const emailValue = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,128}@[A-Z0-9.-]{1,128}\.[A-Z]{2,}/i;
// Avoid quadratic email matching on long SKU descriptions without an @ sign.
const unsafeText = value => secretValue.test(value) || value.includes('@') && emailValue.test(value) || value.includes('\0');
const piiLabel = /\b(?:c[eé]dula|identificaci[oó]n personal|tel[eé]fono|correo electr[oó]nico|domicilio|direcci[oó]n del cliente)\s*[:=]/i;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

export class SnapshotError extends Error {
  constructor(code, message) { super(message); this.name = 'SnapshotError'; this.code = code; }
}
const invalid = () => new SnapshotError('INVALID_SNAPSHOT', 'El snapshot privado no cumple el contrato de datos y procedencia.');
const unavailable = () => new SnapshotError('SNAPSHOT_UNAVAILABLE', 'El repositorio privado de datos no está disponible.');
const conflict = () => new SnapshotError('SNAPSHOT_CONFLICT', 'La captura activa cambió durante la sincronización; vuelva a leer el origen antes de publicar.');
const validId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    && isValidDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
export function snapshotFields(type) {
  if (!Object.hasOwn(fields, type)) return null;
  return [...fields[type], '_sheet_row', ...(['google_consumos', 'claro_export'].includes(type) ? ['source_mode'] : []), ...(type === 'physical_counts' ? ['invalid_negative_count', 'import_batch'] : [])];
}

/** Preserve source values, minimize metadata and fail on drift or unrelated PII.
 * Operational technician names remain private: existing dispatch reconciliation
 * requires them when the source provides no technician code. Customer identities,
 * credential metadata, arbitrary source configuration and unknown fields are forbidden.
 */
export function sanitizeSnapshot(input) {
  if (validated.has(input)) return input;
  if (!plain(input) || Object.keys(input).some(k => !['tables', 'sources'].includes(k)) || !plain(input.tables) || !plain(input.sources)) throw invalid();
  const tables = {}, sources = {};
  let totalRows = 0, totalBytes = Buffer.byteLength('{"tables":{'), tableCount = 0;
  for (const [type, rows] of Object.entries(input.tables)) {
    const allowed = snapshotFields(type);
    if (!allowed || !Array.isArray(rows) || (totalRows += rows.length) > MAX_ROWS) throw invalid();
    totalBytes += Number(tableCount++ > 0) + Buffer.byteLength(JSON.stringify(type)) + 3; // key, colon and []
    const allowedSet = new Set(allowed);
    tables[type] = rows.map((row, index) => {
      if (!plain(row) || !Object.keys(row).length) throw invalid();
      const clean = {};
      for (const [key, value] of Object.entries(row)) {
        if (!allowedSet.has(key)) throw invalid();
        if (key === '_sheet_row') {
          if (!Number.isSafeInteger(value) || value < 1) throw invalid();
        } else if (key === 'import_batch') {
          if (!validId(value)) throw invalid();
        } else if (key === 'invalid_negative_count') {
          if (typeof value !== 'boolean') throw invalid();
        } else if (numericFields.has(key)) {
          if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw invalid();
        } else if (dateFields.has(key)) {
          if (value !== null && value !== '' && !isValidDate(value)) throw invalid();
        } else if (value !== null && (typeof value !== 'string' || value.length > 1000 || unsafeText(value) || piiLabel.test(value))) throw invalid();
        if (key === 'source_mode' && value !== (type === 'google_consumos' ? 'GOOGLE_CONSUMOS' : 'CLARO_EXPORT')) throw invalid();
        clean[key] = value;
      }
      totalBytes += Buffer.byteLength(JSON.stringify(clean)) + Number(index > 0);
      if (totalBytes > MAX_BYTES) throw invalid();
      return Object.freeze(clean);
    });
    Object.freeze(tables[type]);
  }
  // These are the existing engine's authoritative order and material dimensions.
  // Missing inventory remains an explicit coverage gap, not an invented snapshot.
  if (!tables.google_consumos?.length || !tables.sku_catalog?.length) throw invalid();
  if (!tables.google_consumos.some(row => typeof row.order === 'string' && row.order.trim() && typeof row.sku === 'string' && row.sku.trim() && isValidDate(row.date))
    || !tables.sku_catalog.some(row => typeof row.sku === 'string' && row.sku.trim())) throw invalid();
  for (const [type, source] of Object.entries(input.sources)) {
    if (!Object.hasOwn(tables, type) || !plain(source)) throw invalid();
    if (Object.keys(source).some(k => !['source_type', 'source_tab', 'original_data_rows', 'retrieved_at', 'sanitized'].includes(k))) throw invalid();
    const physical = type === 'physical_counts' && source.source_type === 'PRIVATE_PHYSICAL_COUNT_XLSX';
    if (!physical && (source.source_type !== 'GOOGLE_SHEETS_API_READ_ONLY' || !tabs[type] || source.source_tab !== tabs[type])) throw invalid();
    if (physical && source.source_tab !== undefined && (typeof source.source_tab !== 'string' || source.source_tab.length > 100 || unsafeText(source.source_tab))) throw invalid();
    if (!Number.isSafeInteger(source.original_data_rows) || source.original_data_rows !== tables[type].length || source.sanitized !== true || !validTimestamp(source.retrieved_at)) throw invalid();
    sources[type] = Object.freeze({ ...source });
  }
  if (Object.entries(tables).some(([type, rows]) => rows.length && !Object.hasOwn(sources, type))) throw invalid();
  totalBytes += Buffer.byteLength('},"sources":') + Buffer.byteLength(JSON.stringify(sources)) + 1;
  if (totalBytes > MAX_BYTES) throw invalid();
  const clean = Object.freeze({ tables: Object.freeze(tables), sources: Object.freeze(sources) });
  validated.add(clean);
  return clean;
}

function hashValue(hash, value) {
  if (Array.isArray(value)) {
    hash.update('[');
    value.forEach((item, index) => { if (index) hash.update(','); hashValue(hash, item); });
    hash.update(']');
  } else if (plain(value)) {
    hash.update('{');
    Object.keys(value).sort().forEach((key, index) => { if (index) hash.update(','); hash.update(JSON.stringify(key) + ':'); hashValue(hash, value[key]); });
    hash.update('}');
  } else hash.update(JSON.stringify(value));
  return hash;
}
export function snapshotHash(input) {
  const { tables, sources } = sanitizeSnapshot(input);
  // Re-reading identical data is idempotent; source retrieval timestamps are not
  // a business correction. The first immutable capture retains its provenance.
  const stableSources = Object.fromEntries(Object.entries(sources).map(([type, source]) => {
    const { retrieved_at, ...stable } = source;
    return [type, stable];
  }));
  return hashValue(crypto.createHash('sha256'), { tables, sources: stableSources }).digest('hex');
}
const resultRows = result => Array.isArray(result) ? result : result?.rows || [];
// Metadata/chunk checks are bounded; no query returns the whole historical JSON.
const COMPLETE = `s.chunk_count = jsonb_array_length(s.manifest->'chunks')
  AND s.chunk_count = (SELECT count(*) FROM greencall_private.snapshot_chunks c WHERE c.snapshot_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(s.manifest->'chunks') m
    WHERE NOT EXISTS (SELECT 1 FROM greencall_private.snapshot_chunks c WHERE c.snapshot_id = s.id
      AND c.source = m->>'source' AND c.part = (m->>'part')::integer
      AND c.row_count = (m->>'row_count')::integer AND c.content_hash = m->>'content_hash'
      AND c.size_bytes = (m->>'size_bytes')::integer))
  AND NOT EXISTS (SELECT 1 FROM jsonb_each(s.row_counts) r
    WHERE (r.value #>> '{}')::bigint <> (SELECT coalesce(sum(c.row_count), 0) FROM greencall_private.snapshot_chunks c WHERE c.snapshot_id = s.id AND c.source = r.key))`;
const READ_ACTIVE = `SELECT s.id, s.content_hash, s.captured_at, s.manifest, s.row_counts, s.chunk_count
  FROM greencall_private.active_snapshot a JOIN greencall_private.snapshots s ON s.id = a.snapshot_id
  WHERE a.singleton = true AND ${COMPLETE}`;
const READ_STATUS = `SELECT s.id, s.captured_at, s.row_counts
  FROM greencall_private.active_snapshot a JOIN greencall_private.snapshots s ON s.id = a.snapshot_id
  WHERE a.singleton = true AND ${COMPLETE}`;
const READ_POINTER = 'SELECT snapshot_id AS id FROM greencall_private.active_snapshot WHERE singleton = true';
const READ_STAGED = `SELECT s.id, s.content_hash, s.captured_at, s.manifest, s.row_counts, s.chunk_count
  FROM greencall_private.snapshots s WHERE s.content_hash = $1 AND ${COMPLETE}`;

function chunksFor(data) {
  const chunks = [];
  for (const [source, rows] of Object.entries(data.tables)) {
    let part = 0, batch = [], bytes = 2;
    const flush = () => {
      if (!batch.length) return;
      const serialized = JSON.stringify(batch);
      chunks.push({ source, part: part++, row_count: batch.length, content_hash: hashValue(crypto.createHash('sha256'), batch).digest('hex'), size_bytes: Buffer.byteLength(serialized), serialized });
      batch = []; bytes = 2;
    };
    for (const row of rows) {
      const size = Buffer.byteLength(JSON.stringify(row));
      if (size + 2 > MAX_CHUNK_BYTES) throw invalid();
      if (batch.length && (bytes + size + 1 > MAX_CHUNK_BYTES || batch.length >= 2500)) flush();
      bytes += size + Number(batch.length > 0); batch.push(row);
    }
    flush();
  }
  return chunks;
}
function parseJson(value) { return typeof value === 'string' ? JSON.parse(value) : value; }

/** query(text, values) and transaction([{text,values}]) are injectable adapters.
 * Publication requires a real atomic transaction, not sequential HTTP queries.
 */
export function createSnapshotRepository({ query, transaction } = {}) {
  if (typeof query !== 'function') throw new TypeError('Se necesita un adaptador SQL privado.');
  async function readSnapshotRow(row) {
    if (!row) throw invalid();
    const manifest = parseJson(row.manifest), counts = parseJson(row.row_counts);
    if (!plain(manifest) || !plain(manifest.sources) || !plain(counts) || !Array.isArray(manifest.chunks) || manifest.chunks.length > 4096 || row.chunk_count !== manifest.chunks.length) throw invalid();
    const tables = Object.fromEntries(Object.keys(counts).map(source => [source, []]));
    const seen = new Set(), nextParts = {};
    for (const chunk of manifest.chunks) {
      if (!plain(chunk) || !snapshotFields(chunk.source) || !Object.hasOwn(tables, chunk.source) || !Number.isSafeInteger(chunk.part) || chunk.part !== (nextParts[chunk.source] || 0)
        || !Number.isSafeInteger(chunk.size_bytes) || chunk.size_bytes < 2 || chunk.size_bytes > MAX_CHUNK_BYTES
        || !Number.isSafeInteger(chunk.row_count) || chunk.row_count < 1 || chunk.row_count > 2500 || !/^[a-f0-9]{64}$/.test(chunk.content_hash)) throw invalid();
      const identity = chunk.source + ':' + chunk.part;
      if (seen.has(identity)) throw invalid();
      seen.add(identity); nextParts[chunk.source] = chunk.part + 1;
      const stored = resultRows(await query(`SELECT rows, content_hash, row_count, size_bytes FROM greencall_private.snapshot_chunks
        WHERE snapshot_id = $1::uuid AND source = $2 AND part = $3`, [row.id, chunk.source, chunk.part]))[0];
      const rows = parseJson(stored?.rows);
      if (!stored || !Array.isArray(rows) || rows.length !== chunk.row_count || stored.content_hash !== chunk.content_hash
        || stored.row_count !== chunk.row_count || stored.size_bytes !== chunk.size_bytes
        || Buffer.byteLength(JSON.stringify(rows)) !== chunk.size_bytes || hashValue(crypto.createHash('sha256'), rows).digest('hex') !== chunk.content_hash) throw invalid();
      tables[chunk.source].push(...rows);
    }
    if (Object.entries(counts).some(([source, count]) => !Number.isSafeInteger(count) || count !== tables[source].length)) throw invalid();
    const data = sanitizeSnapshot({ tables, sources: manifest.sources });
    if (snapshotHash(data) !== row.content_hash) throw invalid();
    return { id: row.id, captured_at: new Date(row.captured_at).toISOString(), data };
  }
  async function getActiveSnapshotId() {
    try {
      const row = resultRows(await query(READ_POINTER, []))[0];
      if (!row) return null;
      if (!validId(row.id)) throw unavailable();
      return row.id;
    } catch { throw unavailable(); }
  }
  return {
    getActiveSnapshotId,
    async loadSnapshot() {
      try {
        const row = resultRows(await query(READ_ACTIVE, []))[0];
        if (!row) return null;
        return await readSnapshotRow(row);
      } catch (error) { if (error?.code === 'INVALID_SNAPSHOT') throw error; throw unavailable(); }
    },
    async getSnapshotStatus() {
      try {
        const row = resultRows(await query(READ_STATUS, []))[0];
        return row ? { state: 'ready', id: row.id, captured_at: new Date(row.captured_at).toISOString(), row_counts: row.row_counts } : { state: 'snapshot_required' };
      } catch { throw unavailable(); }
    },
    async publishSnapshot(input, { capturedAt = new Date().toISOString(), expectedSnapshotId, afterActivation } = {}) {
      const data = sanitizeSnapshot(input);
      if (!validTimestamp(capturedAt)) throw invalid();
      if (expectedSnapshotId !== undefined && expectedSnapshotId !== null && !validId(expectedSnapshotId)) throw invalid();
      if (typeof transaction !== 'function') throw unavailable();
      const hash = snapshotHash(data);
      const id = [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join('-');
      const chunks = chunksFor(data);
      const manifest = { sources: data.sources, chunks: chunks.map(({ serialized, ...metadata }) => metadata) };
      const manifestJson = JSON.stringify(manifest);
      if (Buffer.byteLength(manifestJson) > MAX_CHUNK_BYTES) throw invalid();
      try {
        const expected = expectedSnapshotId === undefined ? await getActiveSnapshotId() : expectedSnapshotId;
        // Interrupted staging stays inert and can be resumed by its content id.
        // Each request is <= 1 MiB of rows plus bounded SQL/metadata overhead.
        await query(`INSERT INTO greencall_private.snapshots (id, content_hash, captured_at, manifest, row_counts, chunk_count)
          VALUES ($1::uuid, $2, $3::timestamptz, $4::jsonb, $5::jsonb, $6)
          ON CONFLICT (content_hash) DO NOTHING`, [id, hash, capturedAt, manifestJson, JSON.stringify(Object.fromEntries(Object.entries(data.tables).map(([type, rows]) => [type, rows.length]))), chunks.length]);
        for (const chunk of chunks) await query(`INSERT INTO greencall_private.snapshot_chunks
          (snapshot_id, source, part, rows, row_count, content_hash, size_bytes)
          VALUES ($1::uuid, $2, $3, $4::jsonb, $5, $6, $7) ON CONFLICT (snapshot_id, source, part) DO NOTHING`,
        [id, chunk.source, chunk.part, chunk.serialized, chunk.row_count, chunk.content_hash, chunk.size_bytes]);
        // Resume checks must verify persisted rows, not only their declared hash.
        // Append-only payloads remain unchanged between verification and activation.
        await readSnapshotRow(resultRows(await query(READ_STAGED, [hash]))[0]);
        const statements = [{ text: `INSERT INTO greencall_private.active_snapshot (singleton, snapshot_id, activated_at)
          SELECT true, s.id, now() FROM greencall_private.snapshots s WHERE s.content_hash = $1 AND ${COMPLETE}
          AND ((SELECT snapshot_id FROM greencall_private.active_snapshot WHERE singleton = true) IS NOT DISTINCT FROM $2::uuid
            OR (SELECT snapshot_id FROM greencall_private.active_snapshot WHERE singleton = true) = s.id)
          ON CONFLICT (singleton) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id, activated_at = EXCLUDED.activated_at
          WHERE greencall_private.active_snapshot.snapshot_id = $2::uuid
            OR greencall_private.active_snapshot.snapshot_id = EXCLUDED.snapshot_id
          RETURNING snapshot_id AS id`, values: [hash, expected] }];
        // Optional dependent writes (e.g. the physical ledger) commit or roll back with activation.
        if (typeof afterActivation === 'function') statements.push(...afterActivation(id));
        const results = await transaction(statements);
        const row = resultRows(results?.[0])[0];
        if (!row?.id) throw conflict();
        return { id: row.id, content_hash: hash, extra: results.slice(1) };
      } catch (error) { if (error instanceof SnapshotError) throw error; throw unavailable(); }
    },
  };
}

async function defaultRepository(env) {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) return null;
  if (typeof connectionString !== 'string' || !/^postgres(?:ql)?:\/\//i.test(connectionString)) throw unavailable();
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(connectionString);
    return createSnapshotRepository({
      query: (text, values) => sql.query(text, values, { fetchOptions: { signal: AbortSignal.timeout(15_000) } }),
      transaction: statements => sql.transaction(statements.map(({ text, values }) => sql.query(text, values)), { isolationLevel: 'ReadCommitted', fetchOptions: { signal: AbortSignal.timeout(30_000) } }),
    });
  } catch { throw unavailable(); }
}
// No module-level repository or payload cache: credentials and snapshots never
// carry across test, Preview and Production configurations.
export async function loadSnapshot({ env = process.env } = {}) {
  const repository = await defaultRepository(env);
  return repository ? repository.loadSnapshot() : null;
}
export async function getSnapshotStatus({ env = process.env } = {}) {
  const repository = await defaultRepository(env);
  return repository ? repository.getSnapshotStatus() : { state: 'not_configured' };
}
export async function getActiveSnapshotId({ env = process.env } = {}) {
  const repository = await defaultRepository(env);
  return repository ? repository.getActiveSnapshotId() : null;
}
export async function publishSnapshot(input, { env = process.env, capturedAt, expectedSnapshotId, afterActivation } = {}) {
  const repository = await defaultRepository(env);
  if (!repository) throw unavailable();
  return repository.publishSnapshot(input, { capturedAt, expectedSnapshotId, afterActivation });
}

const inside = (file, directory) => file === directory || file.startsWith(directory + path.sep);
async function privatePath(file, { mustExist = false } = {}) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new SnapshotError('UNSAFE_SNAPSHOT_PATH', 'El snapshot debe estar fuera del repositorio y webroot.');
  const resolved = path.resolve(file);
  if (inside(resolved, ROOT)) throw new SnapshotError('UNSAFE_SNAPSHOT_PATH', 'El snapshot debe estar fuera del repositorio y webroot.');
  // Resolve the nearest existing ancestor, including symlinks in nested paths.
  let parent = resolved, suffix = [];
  while (true) {
    try { parent = await fs.realpath(parent); break; }
    catch (error) {
      if (error.code !== 'ENOENT' || path.dirname(parent) === parent) throw error;
      suffix.unshift(path.basename(parent)); parent = path.dirname(parent);
    }
  }
  const real = path.join(parent, ...suffix);
  if (inside(real, await fs.realpath(ROOT))) throw new SnapshotError('UNSAFE_SNAPSHOT_PATH', 'El snapshot debe estar fuera del repositorio y webroot.');
  if (mustExist) {
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > MAX_BYTES || (stat.mode & 0o077) !== 0) throw new SnapshotError('UNSAFE_SNAPSHOT_PATH', 'El archivo privado requiere permisos 0600 y tamaño permitido.');
  }
  return real;
}
export async function readPrivateSnapshot(file) {
  const resolved = await privatePath(file, { mustExist: true });
  try { return sanitizeSnapshot(JSON.parse(await fs.readFile(resolved, 'utf8'))); }
  catch (error) { if (error?.code === 'INVALID_SNAPSHOT') throw error; throw invalid(); }
}
export async function ensurePrivateDirectory(directory) {
  const resolved = path.dirname(await privatePath(path.join(directory, '.greencall-private-check')));
  await fs.mkdir(resolved, { recursive: true, mode: 0o700 });
  if ((await fs.stat(resolved)).mode & 0o077) throw new SnapshotError('UNSAFE_SNAPSHOT_PATH', 'El staging privado requiere una carpeta con permisos 0700.');
  return resolved;
}
export async function writePrivateSnapshot(file, input) {
  const data = sanitizeSnapshot(input), resolved = await privatePath(file);
  await fs.mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
  const temp = resolved + '.tmp.' + crypto.randomBytes(8).toString('hex');
  try {
    await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600, flag: 'wx' });
    await fs.rename(temp, resolved);
  } finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
