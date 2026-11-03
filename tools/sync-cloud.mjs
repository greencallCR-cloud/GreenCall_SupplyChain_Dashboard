#!/usr/bin/env node
/** Offline ingestion worker, never a serverless request handler.
 * No automatic migrations, no Google writes, no operational rows in output.
 *
 * Validate an existing private extract:
 *   node tools/sync-cloud.mjs --from-file /private/snapshot.json
 * Read Sheets through the existing spreadsheets.readonly implementation:
 *   node tools/sync-cloud.mjs --from-sheets --staging-dir /private/greencall
 * Publication additionally requires --apply, GREENCALL_ALLOW_SNAPSHOT_WRITE=1,
 * GREENCALL_SNAPSHOT_ENV=development and DATABASE_URL for an isolated dev branch, or
 * GREENCALL_SNAPSHOT_ENV=production + GREENCALL_ALLOW_PRODUCTION_SNAPSHOT=1 + GREENCALL_SYNC_DATABASE_URL.
 * The migration must already have been reviewed/applied by the operator. This
 * worker cannot infer Neon branch identity from opaque endpoint hostnames.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SheetsSync, DEFAULT_SHEET_ID } from '../src/sheets-sync.mjs';
import { ensurePrivateDirectory, readPrivateSnapshot, writePrivateSnapshot, sanitizeSnapshot, snapshotHash, publishSnapshot, loadSnapshot, getActiveSnapshotId as readActiveSnapshotId } from '../lib/snapshot-store.mjs';

import { acquireWorkerLock } from '../lib/worker-lock.mjs';

const fail = (code, message) => Object.assign(new Error(message), { code });
const HELP = `Uso:
  node tools/sync-cloud.mjs --from-file /ruta/privada/snapshot.json [--apply]
  node tools/sync-cloud.mjs --from-sheets --staging-dir /ruta/privada/staging [--apply]
Solo lectura en Google Sheets; staging fuera del repositorio, permisos 0700/0600.
Google: GREENCALL_GOOGLE_CREDENTIAL_FILE o GOOGLE_APPLICATION_CREDENTIALS.
Neon desarrollo: DATABASE_URL, GREENCALL_SNAPSHOT_ENV=development,
GREENCALL_ALLOW_SNAPSHOT_WRITE=1 y --apply. No aplica migraciones ni publica producción.`;

function argumentsFor(argv) {
  const args = { apply: false, fromSheets: false, fromFile: '', stagingDir: '', help: false };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--apply') args.apply = true;
    else if (flag === '--from-sheets') args.fromSheets = true;
    else if (flag === '--help') args.help = true;
    else if (['--from-file', '--staging-dir'].includes(flag)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw fail('INVALID_SYNC_ARGUMENTS', 'Falta un argumento del worker de sincronización.');
      args[flag === '--from-file' ? 'fromFile' : 'stagingDir'] = value;
    } else throw fail('INVALID_SYNC_ARGUMENTS', 'Opción de sincronización desconocida.');
  }
  if (!args.help && (Number(args.fromSheets) + Number(Boolean(args.fromFile)) !== 1 || args.fromSheets && !args.stagingDir)) throw fail('INVALID_SYNC_ARGUMENTS', 'Seleccione un archivo privado o Sheets con carpeta de staging privada.');
  return args;
}
// Development: DATABASE_URL of an isolated branch. Production: second explicit flag and the
// least-privilege sync role (GREENCALL_SYNC_DATABASE_URL); owner roles are refused.
function checkWriteTarget(env) {
  const disabled = message => fail('SNAPSHOT_WRITE_DISABLED', message);
  if (env.GREENCALL_ALLOW_SNAPSHOT_WRITE !== '1') throw disabled('Publicar requiere --apply, permiso explícito y una conexión autorizada.');
  let target;
  if (env.GREENCALL_SNAPSHOT_ENV === 'development') {
    if (env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') throw disabled('Un destino de desarrollo no puede ejecutarse en un runtime de producción.');
    target = env.DATABASE_URL;
  } else if (env.GREENCALL_SNAPSHOT_ENV === 'production') {
    if (env.GREENCALL_ALLOW_PRODUCTION_SNAPSHOT !== '1') throw disabled('Publicar en producción requiere GREENCALL_ALLOW_PRODUCTION_SNAPSHOT=1.');
    target = env.GREENCALL_SYNC_DATABASE_URL;
  } else throw disabled('Defina GREENCALL_SNAPSHOT_ENV=development o production.');
  let connection;
  try {
    connection = new URL(target);
    if (!['postgres:', 'postgresql:'].includes(connection.protocol) || !connection.hostname) throw new Error();
  } catch { throw disabled('La conexión privada de publicación no es válida.'); }
  if (env.GREENCALL_SNAPSHOT_ENV === 'production' && /owner|admin|postgres$/i.test(decodeURIComponent(connection.username))) throw disabled('Producción exige el rol de sincronización con privilegios mínimos, no el propietario.');
  return { ...env, DATABASE_URL: target };
}

const SAFE_CODES = new Set(['INVALID_SYNC_ARGUMENTS', 'SNAPSHOT_WRITE_DISABLED', 'SHEETS_CONFIG_REQUIRED', 'INVALID_SNAPSHOT', 'UNSAFE_SNAPSHOT_PATH', 'SNAPSHOT_UNAVAILABLE', 'SNAPSHOT_CONFLICT', 'SYNC_IN_PROGRESS', 'SYNC_LOCK_CHANGED']);
const SYNC_CODES = new Set(['GOOGLE_AUTH_FAILED', 'GOOGLE_CREDENTIAL_INVALID', 'GOOGLE_HTTP', 'SOURCE_TAB_MISSING', 'SOURCE_HEADERS_INCOMPATIBLE', 'SOURCE_EMPTY', 'SOURCE_REDUCTION', 'SOURCE_TOO_LARGE', 'SYNC_CONFLICT']);
const SAFE_DETAIL_KEYS = ['tab', 'type', 'status', 'stage', 'reduction_pct', 'detail', 'error'];
/** Public-log-safe failure description: stage + stable code + allow-listed detail. Never the raw
 * message of an upstream error (it can contain connection strings, Google bodies or row values). */
export function describeSyncFailure(error) {
  const stage = typeof error?.stage === 'string' ? error.stage : 'UNKNOWN';
  if (SAFE_CODES.has(error?.code)) return { ok: false, stage, code: error.code, error: error.message };
  if (SYNC_CODES.has(error?.code)) {
    const detail = Object.fromEntries(SAFE_DETAIL_KEYS.filter(k => error.safe?.[k] !== undefined && error.safe?.[k] !== null).map(k => [k, typeof error.safe[k] === 'string' ? error.safe[k].slice(0, 80) : error.safe[k]]));
    return { ok: false, stage, code: error.code, detail };
  }
  const detail = { error_class: String(error?.name || typeof error).replace(/[^A-Za-z]/g, '').slice(0, 40) || 'Error' };
  if (typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code)) detail.sqlstate = error.code; // PostgreSQL SQLSTATE
  else if (typeof error?.code === 'string' && /^[A-Z_]{3,40}$/.test(error.code)) detail.error_code = error.code; // e.g. ECONNRESET
  if (Number.isInteger(error?.status)) detail.status = error.status;
  return { ok: false, stage, code: 'SYNC_UNAVAILABLE', detail };
}

export async function runSyncCloud({ argv = process.argv.slice(2), env = process.env, publish = publishSnapshot, fetchImpl = fetch, loadActiveSnapshot = loadSnapshot, getActiveSnapshotId = readActiveSnapshotId } = {}) {
  const args = argumentsFor(argv);
  if (args.help) return { help: HELP };
  if (args.apply) env = checkWriteTarget(env);
  let data, expectedSnapshotId, release, stage = 'CONFIG', newCuts = {};
  try {
    if (args.fromFile) {
      // Capture the pointer before reading even a manual private extract.
      stage = 'NEON_CONNECT';
      if (args.apply) expectedSnapshotId = await getActiveSnapshotId({ env });
      stage = 'STAGING';
      data = await readPrivateSnapshot(args.fromFile);
    } else {
      const credential = env.GREENCALL_GOOGLE_CREDENTIAL_FILE || env.GOOGLE_APPLICATION_CREDENTIALS;
      if (!credential) throw fail('SHEETS_CONFIG_REQUIRED', 'Se requiere una credencial Google de solo lectura configurada fuera del repositorio.');
      stage = 'STAGING';
      const dir = await ensurePrivateDirectory(args.stagingDir), snapshotFile = path.join(dir, 'snapshot.json');
      release = await acquireWorkerLock(dir);
      // Start from the active private snapshot when publishing: a fresh staging
      // folder must not discard physical-count history held outside Sheets.
      stage = 'NEON_CONNECT';
      const active = args.apply ? await loadActiveSnapshot({ env }) : null;
      stage = 'VALIDATION';
      if (args.apply) expectedSnapshotId = active?.id || null;
      let database = active ? sanitizeSnapshot(active.data) : { tables: {}, sources: {} };
      if (!active) {
        try { await fs.access(snapshotFile); database = await readPrivateSnapshot(snapshotFile); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      const sync = new SheetsSync({ configPath: path.join(dir, 'sheets-sync.json'), getDb: () => database, fetchImpl,
        commit: async next => {
          stage = 'VALIDATION';
          const clean = sanitizeSnapshot({ tables: next.tables, sources: next.sources });
          stage = 'STAGING';
          await writePrivateSnapshot(snapshotFile, clean);
          database = clean;
        },
      });
      stage = 'GOOGLE_AUTH';
      await sync.load();
      await sync.configure({ enabled: true, credential_path: credential, spreadsheet_id: env.GREENCALL_SHEET_ID || DEFAULT_SHEET_ID });
      stage = 'SHEETS_READ';
      const read = await sync.sync({ forceFull: true });
      newCuts = Object.fromEntries(Object.entries(read?.sources || {}).filter(([, v]) => v.new_cut).map(([k, v]) => [k, v.new_cut]));
      stage = 'VALIDATION';
      data = sanitizeSnapshot(database);
    }
    const summary = { mode: 'validated_only', content_hash: snapshotHash(data), row_counts: Object.fromEntries(Object.entries(data.tables).map(([type, rows]) => [type, rows.length])) };
    if (args.apply) {
      stage = 'PUBLISH';
      const result = await publish(data, { env, expectedSnapshotId });
      return { ...summary, mode: 'published', id: result.id, new_cuts: newCuts };
    }
    return { ...summary, new_cuts: newCuts };
  } catch (error) { if (error && typeof error === 'object' && !error.stage) error.stage = stage; throw error; }
  finally { if (release) await release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runSyncCloud();
    process.stdout.write(result.help ? result.help + '\n' : JSON.stringify(result) + '\n');
  } catch (error) {
    // Never print an upstream error, filename, Google response, OAuth email or
    // database connection string. Known local contract messages are safe.
    process.stderr.write(JSON.stringify(describeSyncFailure(error)) + '\n');
    process.exitCode = 1;
  }
}
