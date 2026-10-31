#!/usr/bin/env node
/** Offline ingestion worker, never a serverless request handler.
 * No automatic migrations, no Google writes, no operational rows in output.
 *
 * Validate an existing private extract:
 *   node tools/sync-cloud.mjs --from-file /private/snapshot.json
 * Read Sheets through the existing spreadsheets.readonly implementation:
 *   node tools/sync-cloud.mjs --from-sheets --staging-dir /private/greencall
 * Publication additionally requires --apply, GREENCALL_ALLOW_SNAPSHOT_WRITE=1,
 * GREENCALL_SNAPSHOT_ENV=development and DATABASE_URL for an isolated dev branch.
 * The migration must already have been reviewed/applied by the operator. This
 * worker cannot infer Neon branch identity from opaque endpoint hostnames.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SheetsSync, DEFAULT_SHEET_ID } from '../src/sheets-sync.mjs';
import { ensurePrivateDirectory, readPrivateSnapshot, writePrivateSnapshot, sanitizeSnapshot, snapshotHash, publishSnapshot } from '../lib/snapshot-store.mjs';

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
function checkWriteTarget(env) {
  if (env.GREENCALL_ALLOW_SNAPSHOT_WRITE !== '1' || env.GREENCALL_SNAPSHOT_ENV !== 'development' || !env.DATABASE_URL || env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production') throw fail('SNAPSHOT_WRITE_DISABLED', 'Publicar requiere --apply, permiso explícito y una conexión de desarrollo aislada.');
  try {
    const connection = new URL(env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(connection.protocol) || !connection.hostname) throw new Error();
  } catch { throw fail('SNAPSHOT_WRITE_DISABLED', 'La conexión privada de desarrollo no es válida.'); }
}

export async function runSyncCloud({ argv = process.argv.slice(2), env = process.env, publish = publishSnapshot, fetchImpl = fetch } = {}) {
  const args = argumentsFor(argv);
  if (args.help) return { help: HELP };
  if (args.apply) checkWriteTarget(env);
  let data;
  if (args.fromFile) data = await readPrivateSnapshot(args.fromFile);
  else {
    const credential = env.GREENCALL_GOOGLE_CREDENTIAL_FILE || env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credential) throw fail('SHEETS_CONFIG_REQUIRED', 'Se requiere una credencial Google de solo lectura configurada fuera del repositorio.');
    const dir = await ensurePrivateDirectory(args.stagingDir), snapshotFile = path.join(dir, 'snapshot.json');
    let database = { tables: {}, sources: {} };
    try { await fs.access(snapshotFile); database = await readPrivateSnapshot(snapshotFile); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const sync = new SheetsSync({ configPath: path.join(dir, 'sheets-sync.json'), getDb: () => database, fetchImpl,
      commit: async next => {
        // SheetsSync also records local import batches; only the validated data
        // and bounded source metadata may enter cloud snapshots.
        const clean = sanitizeSnapshot({ tables: next.tables, sources: next.sources });
        await writePrivateSnapshot(snapshotFile, clean);
        database = clean;
      },
    });
    await sync.load();
    await sync.configure({ enabled: true, credential_path: credential, spreadsheet_id: env.GREENCALL_SHEET_ID || DEFAULT_SHEET_ID });
    // A deliberate full read validates every tab/header and avoids stale data
    // when first moving an extract into an isolated database branch.
    await sync.sync({ forceFull: true });
    data = sanitizeSnapshot(database);
  }
  const summary = { mode: 'validated_only', content_hash: snapshotHash(data), row_counts: Object.fromEntries(Object.entries(data.tables).map(([type, rows]) => [type, rows.length])) };
  if (args.apply) {
    const result = await publish(data, { env });
    return { ...summary, mode: 'published', id: result.id };
  }
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await runSyncCloud();
    process.stdout.write(result.help ? result.help + '\n' : JSON.stringify(result) + '\n');
  } catch (error) {
    // Never print an upstream error, filename, Google response, OAuth email or
    // database connection string. Known local contract messages are safe.
    const safeCodes = new Set(['INVALID_SYNC_ARGUMENTS', 'SNAPSHOT_WRITE_DISABLED', 'SHEETS_CONFIG_REQUIRED', 'INVALID_SNAPSHOT', 'UNSAFE_SNAPSHOT_PATH', 'SNAPSHOT_UNAVAILABLE']);
    const known = safeCodes.has(error?.code);
    process.stderr.write(JSON.stringify({ ok: false, code: known ? error.code : 'SYNC_UNAVAILABLE', error: known ? error.message : 'La lectura o publicación privada no se completó; revise la configuración del worker.' }) + '\n');
    process.exitCode = 1;
  }
}
