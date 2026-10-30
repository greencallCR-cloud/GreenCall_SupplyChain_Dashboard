import { checkNeon } from '../lib/neon-status.mjs';
import { jsonResponse, methodGuard } from '../lib/cloud-response.mjs';

/** Primera función Vercel: identifica conexión a Neon, NO certifica datos. */
export default async function handler(request) {
  const invalid = methodGuard(request);
  if (invalid) return invalid;
  const database = await checkNeon(process.env.DATABASE_URL);
  return jsonResponse({
    ok: true,
    version: '1.4.1-cloud-stage1',
    deployment: 'vercel',
    authenticated: false,
    database,
    data: { state: 'pending_migration' },
    sheets: {
      enabled: false,
      state: 'SIN_CONFIGURAR',
      last_sync_at: null,
      busy: false,
    },
    sources: {},
    partial_history: true,
    now: new Date().toISOString(),
  });
}
