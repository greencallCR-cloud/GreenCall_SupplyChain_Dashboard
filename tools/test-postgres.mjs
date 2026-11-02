// Disposable PostgreSQL access for opt-in integration tests ONLY.
// Two isolated modes, both without network ports or remote credentials:
//   GREENCALL_TEST_POSTGRES_CONTAINER=<name>  -> docker exec <name> psql
//   GREENCALL_TEST_POSTGRES_SOCKET=<dir>      -> local psql over a Unix socket
// DATABASE_URL and any remote connection string are never read here.
import { spawn } from 'node:child_process';
import path from 'node:path';

const container = process.env.GREENCALL_TEST_POSTGRES_CONTAINER;
const socket = process.env.GREENCALL_TEST_POSTGRES_SOCKET;
export const postgresAvailable = Boolean(container || socket);
export const postgresMode = container ? 'container' : socket ? 'socket' : null;

function command(database) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(database)) throw new Error('Unsafe disposable database name');
  const psql = ['-w', '-U', 'postgres', '-d', database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
  if (container) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(container)) throw new Error('Unsafe container name');
    return ['docker', ['exec', '-i', container, 'psql', ...psql]];
  }
  if (!path.isAbsolute(socket) || /[\0\s]/.test(socket)) throw new Error('Unsafe socket directory');
  return [process.env.GREENCALL_TEST_PSQL || 'psql', ['-h', socket, ...psql]];
}

export function postgresCommand(database, script) {
  const [bin, args] = command(database);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH } });
    let stdout = '', stderr = '';
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Disposable PostgreSQL test timed out')); }, 15_000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); code === 0 ? resolve(stdout) : reject(new Error('Disposable PostgreSQL rejected test SQL: ' + stderr)); });
    child.stdin.end(script);
  });
}

export function postgresStatement(text, values = []) {
  // Only synthetic test fixtures reach this disposable process. SQL values are
  // quoted independently; no shell is involved and JSON is never shell-expanded.
  const literal = value => value === null || value === undefined ? 'NULL' : typeof value === 'number' ? String(value) : "'" + String(value).replaceAll("'", "''") + "'";
  let statement = text.replace(/\$(\d+)/g, (_, index) => literal(values[Number(index) - 1]));
  if (/^\s*(?:INSERT|UPDATE|DELETE)\b/i.test(statement) && !/\bRETURNING\b/i.test(statement)) statement += ' RETURNING 1';
  return `WITH test_result AS (${statement}) SELECT coalesce(json_agg(test_result), '[]'::json) FROM test_result;`;
}

export function postgresAdapter(database) {
  return {
    query: async (text, values) => JSON.parse((await postgresCommand(database, postgresStatement(text, values))).trim()),
    transaction: async statements => (await postgresCommand(database, 'BEGIN;\n' + statements.map(({ text, values }) => postgresStatement(text, values)).join('\n') + '\nCOMMIT;')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)),
  };
}

export async function withDisposableDatabase(migrations, run) {
  const database = 'greencall_test_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
  await postgresCommand('postgres', `CREATE DATABASE ${database};`);
  try {
    for (const migration of migrations) await postgresCommand(database, migration);
    return await run(database, postgresAdapter(database));
  } finally { await postgresCommand('postgres', `DROP DATABASE ${database} WITH (FORCE);`); }
}
