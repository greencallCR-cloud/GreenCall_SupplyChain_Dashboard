// Provision GreenCall private storage on a Neon database WITHOUT printing secrets.
//   GREENCALL_OWNER_DATABASE_URL=... node tools/neon-provision.mjs --check
//   GREENCALL_OWNER_DATABASE_URL=... node tools/neon-provision.mjs --dry-run      (migrations in a rolled-back tx)
//   GREENCALL_OWNER_DATABASE_URL=... node tools/neon-provision.mjs --apply --secrets-file /private/path/greencall.env [--rotate]
// - Migrations are additive (db/migrations/*.sql) and verified in a rolled-back transaction first.
// - Creates three least-privilege LOGIN roles. Neon's control plane only accepts plaintext
//   passwords (sent over TLS, never logged here); they are written ONLY to --secrets-file
//   (absolute path outside the repository, mode 0600). Nothing secret is logged.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, neonConfig } from '@neondatabase/serverless';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const argValue = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const ownerUrl = process.env.GREENCALL_OWNER_DATABASE_URL;
const redact = text => String(text).replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgres://<redacted>').replace(/npg_[A-Za-z0-9]+/g, '<redacted>');
const log = (...parts) => console.log(redact(parts.join(' ')));
if (!ownerUrl || !/^postgres(?:ql)?:\/\//.test(ownerUrl)) { log('Set GREENCALL_OWNER_DATABASE_URL (owner/migration connection; never committed).'); process.exit(2); }
neonConfig.webSocketConstructor ??= globalThis.WebSocket;

export const ROLES = {
  gc_dashboard_read: { env: 'DATABASE_URL', grants: [
    'GRANT USAGE ON SCHEMA greencall_private TO gc_dashboard_read',
    'GRANT SELECT ON greencall_private.snapshots, greencall_private.snapshot_chunks, greencall_private.active_snapshot, greencall_private.physical_import_batches TO gc_dashboard_read'] },
  gc_physical_write: { env: 'GREENCALL_PHYSICAL_DATABASE_URL', grants: [
    'GRANT USAGE ON SCHEMA greencall_private TO gc_physical_write',
    'GRANT SELECT ON greencall_private.snapshots, greencall_private.snapshot_chunks, greencall_private.active_snapshot, greencall_private.physical_import_batches TO gc_physical_write',
    'GRANT INSERT ON greencall_private.snapshots, greencall_private.snapshot_chunks, greencall_private.physical_import_batches TO gc_physical_write',
    'GRANT INSERT, UPDATE ON greencall_private.active_snapshot TO gc_physical_write'] },
  gc_sheets_sync: { env: 'GREENCALL_SYNC_DATABASE_URL', grants: [
    'GRANT USAGE ON SCHEMA greencall_private TO gc_sheets_sync',
    'GRANT SELECT ON greencall_private.snapshots, greencall_private.snapshot_chunks, greencall_private.active_snapshot, greencall_private.physical_import_batches TO gc_sheets_sync',
    'GRANT INSERT ON greencall_private.snapshots, greencall_private.snapshot_chunks TO gc_sheets_sync',
    'GRANT INSERT, UPDATE ON greencall_private.active_snapshot TO gc_sheets_sync'] },
};

export function scramVerifier(password, salt = crypto.randomBytes(16), iterations = 4096) {
  const salted = crypto.pbkdf2Sync(password.normalize('NFKC'), salt, iterations, 32, 'sha256');
  const hmac = (key, text) => crypto.createHmac('sha256', key).update(text).digest();
  const stored = crypto.createHash('sha256').update(hmac(salted, 'Client Key')).digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${stored.toString('base64')}:${hmac(salted, 'Server Key').toString('base64')}`;
}
const quoteIdent = name => { if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw Error('unsafe identifier'); return '"' + name + '"'; };
const quoteLiteral = text => "'" + String(text).replaceAll("'", "''") + "'";

async function connect(url = ownerUrl) { const client = new Client(url); await client.connect(); return client; }
async function migrations() {
  const dir = path.join(root, 'db', 'migrations');
  const files = (await fs.readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  return Promise.all(files.map(async f => [f, (await fs.readFile(path.join(dir, f), 'utf8'))]));
}
// Each migration wraps itself in BEGIN/COMMIT; strip those to nest them in one transaction.
const body = sql => sql.replace(/^\s*BEGIN;\s*$/m, '').replace(/^\s*COMMIT;\s*$/m, '');

async function check(client) {
  const info = (await client.query('select current_database() db, current_user usr, split_part(version(), \' \', 2) pg')).rows[0];
  const schema = (await client.query("select count(*)::int n from pg_namespace where nspname = 'greencall_private'")).rows[0].n;
  const tables = (await client.query("select table_name from information_schema.tables where table_schema = 'greencall_private' order by 1")).rows.map(r => r.table_name);
  const roles = (await client.query("select rolname, rolcanlogin from pg_roles where rolname like 'gc\\_%' order by 1")).rows;
  const active = tables.includes('active_snapshot') ? (await client.query('select snapshot_id, activated_at from greencall_private.active_snapshot')).rows[0] || null : null;
  log(JSON.stringify({ ...info, greencall_private: Boolean(schema), tables, roles, active_snapshot: active }));
}

async function applyMigrations(client, { dryRun }) {
  await client.query('BEGIN');
  try {
    for (const [name, sql] of await migrations()) { await client.query(body(sql)); log('migration ok:', name); }
    if (dryRun) { await client.query('ROLLBACK'); log('dry-run: rolled back, nothing persisted'); return; }
    await client.query('COMMIT'); log('migrations committed');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
}

async function provisionRoles(client, { rotate, envFile }) {
  const resolved = path.resolve(envFile || '');
  if (!envFile || !path.isAbsolute(envFile) || resolved.startsWith(root + path.sep)) throw Error('--secrets-file must be an absolute path outside the repository');
  const url = new URL(ownerUrl);
  const lines = [], existing = new Set((await client.query("select rolname from pg_roles where rolname like 'gc\\_%'")).rows.map(r => r.rolname));
  await client.query('BEGIN');
  try {
    for (const [role, spec] of Object.entries(ROLES)) {
      const create = !existing.has(role);
      if (!create && !rotate) { log('role exists, password unchanged (use --rotate):', role); }
      else {
        const password = crypto.randomBytes(30).toString('base64url');
        await client.query(create
          ? `CREATE ROLE ${quoteIdent(role)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION CONNECTION LIMIT 50 PASSWORD ${quoteLiteral(password)}`
          : `ALTER ROLE ${quoteIdent(role)} WITH PASSWORD ${quoteLiteral(password)}`);
        const target = new URL(url); target.username = role; target.password = password;
        lines.push(`${spec.env}=${target.toString()}`);
        log(create ? 'role created:' : 'role rotated:', role);
      }
      await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA greencall_private FROM ${quoteIdent(role)}`);
      for (const grant of spec.grants) await client.query(grant);
      await client.query(`ALTER ROLE ${quoteIdent(role)} SET statement_timeout = '30s'`);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  let keys = '';
  try { keys = await fs.readFile(resolved, 'utf8'); } catch {}
  const has = name => new RegExp('^' + name + '=', 'm').test(keys);
  for (const name of ['GREENCALL_ACCESS_KEY', 'GREENCALL_SESSION_SECRET', 'GREENCALL_ADMIN_KEY']) if (!has(name)) lines.push(`${name}=${crypto.randomBytes(32).toString('base64url')}`);
  const kept = keys.split('\n').filter(line => line && !lines.some(l => l.split('=')[0] === line.split('=')[0]));
  await fs.mkdir(path.dirname(resolved), { recursive: true, mode: 0o700 });
  await fs.writeFile(resolved, [...kept, ...lines].join('\n') + '\n', { mode: 0o600 });
  await fs.chmod(resolved, 0o600);
  log('private env file written (0600):', resolved, 'variables:', [...kept, ...lines].map(l => l.split('=')[0]).join(', '));
}

async function verifyRoles(envFile) {
  const env = Object.fromEntries((await fs.readFile(envFile, 'utf8')).split('\n').filter(Boolean).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  for (const [role, spec] of Object.entries(ROLES)) {
    if (!env[spec.env]) { log('skip verify (no url in env file):', role); continue; }
    const client = await connect(env[spec.env]);
    try {
      const who = (await client.query('select current_user u')).rows[0].u;
      const can = async (table, priv) => (await client.query('select has_table_privilege($1, $2) ok', ['greencall_private.' + table, priv])).rows[0].ok;
      const result = { role: who, select_snapshots: await can('snapshots', 'SELECT'), insert_snapshots: await can('snapshots', 'INSERT'), insert_ledger: await can('physical_import_batches', 'INSERT'), update_active: await can('active_snapshot', 'UPDATE'), delete_snapshots: await can('snapshots', 'DELETE') };
      let publicTable = false; try { await client.query('select 1 from public.playing_with_neon limit 1'); publicTable = true; } catch {}
      log('verify', JSON.stringify({ ...result, reads_public_tables: publicTable }));
    } finally { await client.end(); }
  }
}

const client = await connect();
try {
  if (args.has('--check')) await check(client);
  if (args.has('--dry-run')) await applyMigrations(client, { dryRun: true });
  if (args.has('--apply')) {
    await applyMigrations(client, { dryRun: true });
    await applyMigrations(client, { dryRun: false });
    await provisionRoles(client, { rotate: args.has('--rotate'), envFile: argValue('--secrets-file') });
    await check(client);
  }
  if (args.has('--verify')) await verifyRoles(argValue('--secrets-file'));
} catch (error) { log('ERROR:', error.message); process.exitCode = 1; }
finally { await client.end(); }
