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

La carpeta de staging tiene un bloqueo exclusivo durante extracción, guardado y publicación. Otro worker debe esperar a una ejecución posterior. Si queda `.sync.lock` tras una interrupción, verificar que no exista un worker activo y archivar el bloqueo mediante recuperación administrativa; no se roba un bloqueo automáticamente por antigüedad o PID. Al publicar desde Sheets se recupera el snapshot activo privado, incluidos sus conteos físicos, y la activación exige que el puntero no haya cambiado desde antes de la extracción. Ante `SNAPSHOT_CONFLICT`, repetir la lectura completa desde el estado activo; no forzar un overwrite.

## Exportaciones privadas

`GET /api/exports` exige la misma sesión que el dashboard. Soporta ABC, planning, forecast, conteos/intervalos y tablas de origen permitidas. Conserva filtros globales y búsqueda del explorador, sanea fórmulas de CSV y devuelve un archivo con BOM. Las cantidades y costos desconocidos conservan su ausencia. El exportador de consumos usa la fuente Google principal, sin sumar el histórico alternativo Claro.

Se rechazan antes de enviar un archivo parcial las descargas de más de 100.000 filas o 4 MiB. Aplicar filtros o reducir el período. La interfaz informa el error sin salir del dashboard. Los archivos descargados contienen información operativa privada: conservarlos sólo en el entorno autorizado. Los tests de esta implementación usan exclusivamente fixtures sintéticos.

## Tomas físicas Cloud (carga manual habitual)

Flujo: `POST /api/physical/preview` (no escribe) → `POST /api/physical/apply` (con `x-file-sha256` y `x-base-snapshot` devueltos por la vista previa) → `GET /api/physical/batches` (historial) → `POST /api/physical/revert` (`{batch_id, base_snapshot_id}`). Google Sheets nunca se escribe.

- **Acceso:** leer el historial exige sesión; previsualizar, aplicar y revertir exigen la clave de administración `GREENCALL_ADMIN_KEY` (≥32 caracteres, distinta de `GREENCALL_ACCESS_KEY`) y mismo origen. La cookie firmada lleva el rol; sin clave admin válida el rol es siempre lectura (`ADMIN_NOT_CONFIGURED`, 503). La identidad es compartida (`actor = admin_key`): no hay todavía usuarios individuales.
- **Escritura separada:** `GREENCALL_PHYSICAL_DATABASE_URL` usa un rol distinto del runtime de lectura: `USAGE` en `greencall_private`, `SELECT` en sus tablas, `INSERT` en `snapshots`, `snapshot_chunks` y `physical_import_batches`, `INSERT/UPDATE` en `active_snapshot`. Sin esa variable la API responde `SIN_CREDENCIALES` y la UI lo declara; no se simula ninguna carga.
- **Migración:** aplicar `db/migrations/20261102_001_physical_imports.sql` después de `20261031_001_snapshots.sql`, primero en una rama Neon de desarrollo con conexión directa. Es aditiva e idempotente; la bitácora es append-only (trigger) y admite una sola reversión por lote (índice único parcial).
- **Validación:** XLSX/XLSM/CSV ≤4 MiB y ≤20.000 filas; sólo hojas con encabezados de toma física (las demás se informan como ignoradas). Errores bloqueantes por fila y campo: fecha ausente/inválida/futura (hora de Costa Rica), técnico o SKU ausente, SKU excluido `7005189`, conteo ausente o negativo, conteo fraccionario en unidades de pieza, duplicado con conteo distinto. Avisos: SKU fuera de catálogo, unidad ausente o ambigua, técnico fuera de `Tecnicos`, fila serializada (conteo agregado, no prueba series) y duplicado idéntico. Los totales se muestran por unidad sin sumarlas entre sí.
- **Integridad:** el lote y la activación del nuevo snapshot se confirman en la misma transacción con CAS sobre el snapshot de la vista previa. Si otra publicación ocurrió entre medio, nada se escribe (`SNAPSHOT_CONFLICT`) y se debe volver a previsualizar. El reintento del mismo archivo sobre la misma base es idempotente. Los conteos efectivos se reconstruyen como conteos legados + reproducción ordenada de los lotes no revertidos; por eso revertir restaura el valor anterior exacto y, si no quedan lotes, reactiva el snapshot inmutable original. `captured_at` de Sheets no cambia con una toma física; la fecha de carga queda en la fuente `physical_counts`.
- **Rollback operativo:** revertir el lote desde la UI o la API; nunca borrar filas. Ante `LEDGER_MISMATCH` (snapshot con lotes ausentes de la bitácora) no importar hasta reconciliar.
- **QA:** `tools/physical-import.test.mjs`, `tools/physical-service.test.mjs` (incluye PostgreSQL desechable), `tools/cloud-physical.test.mjs`, `tools/cloud-auth.test.mjs`. Navegador: `GREENCALL_TEST_POSTGRES_SOCKET=<dir> node tools/qa-physical-cloud-server.mjs` levanta un servidor loopback con datos sintéticos rotulados y una base desechable.

## Validación reproducible

```sh
npm ci --ignore-scripts
npm run check
npm test
GREENCALL_TEST_POSTGRES_SOCKET=/ruta/socket node --test tools/snapshot-store.test.mjs tools/physical-service.test.mjs  # PostgreSQL desechable local (o GREENCALL_TEST_POSTGRES_CONTAINER)
npm run ui:test
npm run cloud:dev
```

`npm test` ejecuta contratos sintéticos explícitos, HTTP real de los handlers, pronósticos y regresiones de sincronización/seguridad. No certifica el histórico privado ausente. `npm run validate`, `npm run perf` y `npm run http-qa` conservan sus exigencias de paridad histórica: requieren el respaldo privado completo en `local-data/base.json` y no deben reportarse como exitosos con una base vacía.

`tools/forecast_reference_input.mjs` y `tools/qa_forecast_reference.py` permiten contrastar los cálculos con Statsmodels/Polars en un entorno Python de trabajo. No son dependencias de producción. El selector compara candidatos a un paso. Una evaluación externa separada repite esa selección con el pasado de cada corte y puntúa 3/6/12 meses contra la última observación, con tres a seis cortes completos. Si se salta un mes parcial, evalúa los mismos plazos desplazados que se muestran en la proyección. Los cortes pueden solaparse; se declara la ponderación por par corte–mes. La pantalla distingue el error del selector a un mes de la evaluación multimes del procedimiento. Sin historia suficiente, las métricas quedan sin calcular. No se muestran bandas de probabilidad sin calibración ni se certifica precisión operativa con fixtures sintéticos.

## Pendientes de producción

Identidad por usuario y roles; limitación persistente de intentos; lectura/sincronización real desde el runtime autorizado; comparación completa de datos privados y cortes; medición operativa de rendimiento; aplicar la migración física y crear el rol escritor en una rama Neon de desarrollo; pruebas de recuperación en la rama remota. La importación física local y los importadores legacy se conservan.
