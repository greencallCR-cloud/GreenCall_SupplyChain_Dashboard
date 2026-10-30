export function jsonResponse(payload, status = 200, extras = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, private, max-age=0',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      ...extras,
    },
  });
}
export function methodGuard(request, method = 'GET') {
  if (request.method === method) return null;
  return jsonResponse({ ok: false, error: 'Método no permitido.' }, 405, { allow: method });
}
export function dataPending() {
  return jsonResponse({
    ok: false,
    code: 'DATA_MIGRATION_PENDING',
    error: 'La API de Vercel está disponible, pero la migración de históricos y el backend de indicadores a Neon aún no se han completado. No se muestran datos ficticios.',
  }, 503);
}
