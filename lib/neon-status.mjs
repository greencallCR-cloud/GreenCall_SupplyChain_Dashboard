/**
 * GreenCall Cloud – comprobación de lectura de Neon, sin escribir datos ni
 * transmitir contraseñas al navegador o a los logs.
 */
export async function checkNeon(connectionString, makeClient) {
  if (!connectionString) return { state: 'not_configured' };
  if (typeof connectionString !== 'string' || !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
    return { state: 'invalid_config' };
  }
  try {
    const create = makeClient || (async () => {
      const { neon } = await import('@neondatabase/serverless');
      return neon(connectionString);
    });
    const sql = await create(connectionString);
    const query = sql`SELECT current_database() AS db_name`;
    // La consulta es de solo lectura. Timeout para no bloquear el estado.
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Tiempo de espera agotado')), 7000);
    });
    let rows;
    try { rows = await Promise.race([query, timeout]); }
    finally { clearTimeout(timer); }
    if (rows?.[0]?.db_name !== 'greencall_bi') return { state: 'wrong_database' };
    return { state: 'connected' };
  } catch {
    // No devolver mensajes de PostgreSQL: pueden contener detalles de infraestructura.
    return { state: 'unavailable' };
  }
}
