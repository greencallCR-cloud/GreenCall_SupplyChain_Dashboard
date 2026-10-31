# Operación Cloud v2 y límites verificados

## Ruta de lectura

Se conserva Node ESM, la interfaz vanilla/Plotly y el arranque local Windows. Cambiar de framework ahora añadiría riesgo sin resolver los bloqueos de credenciales o datos.

`Sheets readonly → worker privado → validación de esquema/procedencia → snapshot inmutable en Neon → sesión protegida → analyze() → dashboard/paginación → interfaz`.

Los handlers usan `export default {fetch(request)}` conforme a la API Web de Vercel. `vercel.json` publica únicamente `public/`; `.vercelignore` excluye históricos, archivos privados, documentación y scratch. Los endpoints HTTP no ejecutan migraciones ni sincronizaciones largas.

## Acceso de Preview

- Configurar `GREENCALL_ACCESS_KEY` y `GREENCALL_SESSION_SECRET` como **dos secretos aleatorios distintos**, de al menos 32 caracteres cada uno, sólo en el entorno Preview autorizado. No usar contraseñas humanas ni guardarlos en Git, reportes o capturas.
- Mantener Vercel Deployment Protection. La clave de acceso de esta etapa sirve a un grupo restringido; no reemplaza identidades individuales, roles y limitación persistente de intentos para producción.
- El login crea una cookie `__Host-`, Secure, HttpOnly, SameSite=Strict, firmada y vigente ocho horas. Login y logout exigen el mismo Origin. Rotar el secreto de firma revoca todas las sesiones.
- Sin configuración, los datos responden 503; con configuración y sin sesión, 401. El estado público no consulta Neon ni entrega cortes, inventarios, series o costos.
- Logout borra la cookie y la UI limpia inmediatamente sus datos. Una copia robada de una sesión sigue válida hasta su expiración o rotación del secreto; no se afirma revocación individual.

## Neon: desarrollo aislado

La migración en `db/migrations/20261031_001_snapshots.sql` es aditiva y se prueba en PostgreSQL desechable. **No se aplicó a una base remota en esta sesión.** Aplicarla primero a una rama de desarrollo identificada y con recuperación disponible, mediante conexión directa.

La aplicación necesita una conexión `DATABASE_URL` de lectura con permisos mínimos sobre `greencall_private`; el worker usa una identidad de ingestión separada. No asumir que los secretos de Production se heredan en Preview. No cambiar roles o visibilidad automáticamente.

Los payloads se almacenan en fragmentos acotados, con manifiesto, hashes y conteos. El puntero activo cambia sólo cuando la publicación está completa. Los snapshots anteriores se conservan; volver al anterior significa cambiar el puntero de activación a una versión verificada. No borrar historia para hacer rollback.

## Worker de Sheets en solo lectura

`npm run cloud:sync -- --help` muestra las opciones reales.

Para una extracción completa, configurar fuera del repositorio `GREENCALL_GOOGLE_CREDENTIAL_FILE` (o `GOOGLE_APPLICATION_CREDENTIALS`) con una cuenta de servicio lectora del documento. La implementación usa únicamente el scope `spreadsheets.readonly`. La carpeta privada de staging debe estar fuera del repositorio y del webroot, con permisos 0700/0600.

```sh
node tools/sync-cloud.mjs --from-sheets --staging-dir /ruta/privada/greencall
node tools/sync-cloud.mjs --from-file /ruta/privada/greencall/snapshot.json
```

Sin `--apply` valida y no publica en Neon. Publicar exige además `GREENCALL_ALLOW_SNAPSHOT_WRITE=1`, `GREENCALL_SNAPSHOT_ENV=development` y la conexión de la rama aislada. El worker no puede deducir la identidad de una rama a partir de un hostname opaco; el operador debe suministrar el destino correcto. No configura cron ni promete sincronización continua.

El conector Google de esta conversación y el proceso de la aplicación tienen credenciales distintas. La lectura conectada verifica el origen, pero no autoriza al backend desplegado. Un snapshot no certifica conexión actual a Google; se informa como precargado y conserva su fecha de captura.

## Validación reproducible

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run cloud:dev
```

`npm test` ejecuta contratos sintéticos explícitos, HTTP real de los handlers, pronósticos y regresiones de sincronización/seguridad. No certifica el histórico privado ausente. `npm run validate`, `npm run perf` y `npm run http-qa` conservan sus exigencias de paridad histórica: requieren el respaldo privado completo en `local-data/base.json` y no deben reportarse como exitosos con una base vacía.

`tools/forecast_reference_input.mjs` y `tools/qa_forecast_reference.py` permiten contrastar los cálculos con Statsmodels/Polars en un entorno Python de trabajo. No son dependencias de producción. El backtest actual evalúa un paso mensual y hasta seis orígenes; las proyecciones a 3/6/12 meses no equivalen a precisión verificada en esos horizontes. No se muestran bandas de probabilidad sin calibración.

## Pendientes de producción

Identidad por usuario y roles; limitación persistente de intentos; lectura/sincronización real desde el runtime autorizado; comparación completa de datos privados y cortes; medición operativa de rendimiento; importación física persistente en Cloud y exportaciones Cloud; pruebas de recuperación en la rama remota. La importación física local y los importadores legacy se conservan.
