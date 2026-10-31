# ESTADO VIVO Y CHECKPOINT — GreenCall Codex

> Este documento SE DEBE ACTUALIZAR EN CADA HITO VERIFICADO y commitear. En nueva tarea, se lee junto con AGENTS.md. No escribir secretos ni datos personales.

## Baseline de arranque (31/10/2026)
- Repo: `greencallCR-cloud/GreenCall_SupplyChain_Dashboard`; en último chequeo conocido GitHub declaró `visibility: public`; confirmar de nuevo.
- Código de trabajo: `develop-cloud`, con Cloud Stage1. Rama nueva recomendada `codex/greencall-v2` **desde develop-cloud**; no resetear ni borrar rama antigua.
- App Production: frontend estático se visualizaba, `/api/status` daba 404; API en `develop-cloud` Preview Ready pero falta validar JSON en vivo.
- Neon: proyecto `greencall-supplychain-bi`, base `greencall_bi`, branch `production`; el usuario verificó `SELECT current_database()`; en Vercel se guardó `DATABASE_URL` para Production, no confirma acceso de Preview.
- Sheets maestro: ID `1gUK6b2eLyC2Al5opwiNb1r21-QAYrsJtncS37aP8nj8`. Metadatos anteriores: 38 tabs, `Consumos` 173762 filas de cuadrícula incl. encabezado. El snapshot local original documenta 173761 líneas históricas. Los números son cortes previos, no estado vivo actual.
- Codex Cloud: entorno publicado por el usuario, sesión de instalación indicó 26 skills globales + Superpowers remoto; nueva tarea debe revalidar disponibilidad y autorización efectiva Google/Neon.
- Al arranque no se han aplicado cambios productivos por este kit. Los archivos de este kit están fuera del repo hasta ser incorporados.

## Checkpoint de recuperación — 31/10/2026 09:26 America/Costa_Rica

### Estado conservado y base Git
- Workspace `/workspace/GreenCall_SupplyChain_Dashboard` conservado tras la interrupción. No se perdió ninguno de los archivos nuevos principales enumerados aquí.
- Rama local `codex/greencall-v2`, creada desde `bc8429c498c685dc95ba36822062119362a7d477` de `origin/develop-cloud`. Antes de este checkpoint no existía rama remota `codex/greencall-v2`; índice vacío y cambios sin commit.
- Se verificaron status, diff, índice, diez commits y ramas locales/remotas. No se usó reset, clean ni reemplazo de archivos recuperables.
- Este commit es un **checkpoint de código recuperado y regresiones verificadas**. Todavía no declara certificación productiva ni validación completa del histórico privado.

### Código recuperado
- `lib/cloud-auth.mjs`, `lib/cloud-api.mjs`, handlers Vercel `default.fetch`, login/logout, cookies firmadas Secure/HttpOnly, protección de origen y acceso cerrado por defecto.
- `lib/snapshot-store.mjs`, `lib/dashboard-service.mjs`, migración aditiva privada y `tools/sync-cloud.mjs`: manifiestos y fragmentos inmutables acotados, activación completa, paginación y analítica existente. No se aplicó migración remota.
- `public/`: nuevo shell GreenCall, navegación accesible, estados sin datos/login/error, toma física local diferenciada de recuperación legacy; corrección del tipo inicial del explorador confirmada en archivo.
- `src/forecast.mjs` y su integración: comparación cronológica sobre orígenes comunes, métricas explícitas, meses parciales separados y ausencia de bandas no calibradas. También se conservan corrección de fechas ISO imposibles y prioridad de actividad desde la columna Fuente.
- Pruebas nuevas, lockfile, configuración Vercel y documentos `GREENCALL_CLOUD_V2_OPERACION.md` y `superpowers/plans/2026-10-31-cloud-v2.md`.

### Evidencia recuperada y repetida
- `npm run check`: 40 archivos de código verificados en la recuperación.
- `npm test`: suite Node sin fallos; benchmarks/PostgreSQL son opt-in y no se incluyen como ejecutados en este comando. Además Sheets sync 13/13 y hardening 9/9.
- Ejecución previa: forecasting 20/20 y comparación sintética con Statsmodels/Polars; scripts reproducibles en `tools/forecast_reference_input.mjs` y `tools/qa_forecast_reference.py`. El reporte existe localmente en `work/forecast-reference-report.json`.
- `npm run validate` anterior: 10 aprobadas y 15 fallidas porque falta el respaldo histórico privado completo. No marcar paridad histórica como aprobada; el checkout tiene una base vacía de arranque.
- Capturas reales recuperadas bajo `/workspace/work/greencall-*`: antes/después, cinco tamaños requeridos, login y vacío autenticado. Los reportes previos no sustituyen una repetición tras cambios posteriores. Hay una captura **SYNTHETIC** separada; no es evidencia de operación real.
- Google conectado: sólo GET de metadatos, encabezados y columnas mínimas. Contraste del conteo de órdenes y prioridad de columnas realizado; no se publican filas, costos ni agregados privados en Git. La lectura por bloques no fue un snapshot atómico.

### Agentes y revisión
- `statistics` terminó y entregó código/tests/comparadores, sin commits propios.
- `skills_audit` terminó verificación efectiva de skills y lecturas de origen, sin editar fuentes.
- `frontend`, `data_backend` y `security_review` quedaron interrumpidos por cuota después de escribir cambios. Se recuperaron sus archivos; falta cerrar su revisión completa.
- Revisión de seguridad previa confirmó controles principales y detectó un error del tipo inicial del explorador: la asignación correctora existe en `public/assets/app.js`.

### Skills aplicadas y límites externos
- Aplicadas: Superpowers (plan, TDD, revisión/verificación), UI UX Pro Max, Frontend Design, Web Design Guidelines, Agent Browser, BI/calidad/KPIs/visualización, Statsmodels/Polars, Neon/Postgres, Deploy to Vercel y Google Workspace de lectura.
- Entorno Cloud sigue sin secretos, variables runtime ni identidad externa configurados. `gws` existe pero no tiene OAuth. El conector de conversación no es una credencial de la aplicación.
- GitHub sigue público según lectura previa: no incluir datasets privados, secretos ni capturas operativas. El Preview anterior respondió redirección 302 a Vercel SSO; no se confirmó API autenticada desde aquí.
- No se modificaron Google Sheets, costos operativos, Production ni la base Neon remota.

### Siguiente acción exacta
1. Comprobar SHA/push de este checkpoint mediante `git log -1` y `git ls-remote --heads origin codex/greencall-v2`.
2. Repetir pruebas opt-in de almacenamiento en PostgreSQL desechable y benchmark; revisar integridad/activación de fragmentos y worker.
3. Cerrar regresión de UI con el backend real y fixtures sintéticos claramente separados; revisar todos los módulos y carreras asíncronas.
4. Revisión independiente completa, corregir hallazgos, commit y push por hito; inspeccionar Preview asociado al SHA real. No eludir SSO.
5. Continuar exportaciones/importación física Cloud y conexión runtime sólo con secretos/rama de desarrollo autorizados disponibles.

Último SHA previo al checkpoint: `bc8429c`. El SHA de este checkpoint se registra en la siguiente actualización; su contenido se identifica por el commit `chore: recover and checkpoint GreenCall cloud v2 work`.

## Hito siguiente — revisión, integridad y exportaciones (31/10/2026)

- Recuperación confirmada y publicada en `de8f6431a5870e34577640c35789ba3eaf6acd99`; PR #1, borrador hacia `develop-cloud`: https://github.com/greencallCR-cloud/GreenCall_SupplyChain_Dashboard/pull/1.
- Preview de ese SHA observado en comentario de Vercel: `https://greencall-supplychain-da-git-8b820b-greencallcr-clouds-projects.vercel.app`. Estado Ready confirmado por GitHub; `/api/status`, `/api/dashboard` y `/api/rows` responden 302 a Vercel SSO sin credenciales de visitante. No se afirma ejecución autenticada remota.
- Revisión independiente `snapshot_review_v2`: corregidos activación de fragmentos previamente incorrectos, carreras entre publicaciones y límite de archivo que omitía envoltorio JSON. Preactivación verifica contenido real; CAS exige el puntero esperado capturado antes de extraer; los históricos siguen inmutables.
- Worker: bloqueo exclusivo de staging, liberación en error, sin robo automático de bloqueos antiguos; staging nuevo parte del snapshot activo privado para conservar físicos. Test de concurrencia determinista y de conservación del historial físico.
- Nuevo `/api/exports`: sesión antes de lectura, filtros y búsqueda, sanitización CSV, BOM, límites de 100.000 filas y 4 MiB. Inventario exporta la misma vista calculada que la pantalla; la consulta cruda usa sus cortes. Un error de descarga conserva la pantalla.
- Salud Cloud distingue `snapshot_at` de `last_sync_at`: la fecha de captura nunca se presenta como conexión o lectura Google actual certificada.
- Revisión UI `ui_recovery_qa`: corrigieron contraste, fuga de foco del modal y skip link que cambiaba de módulo. Hay runner reproducible `tools/ui-regression.mjs`; la ejecución completa todavía debe cerrarse antes de certificar este hito visual.
- Verificación repetida: PostgreSQL 17 aislado, frontera 128 MiB y benchmark sintético 175.000 filas: **23/23**, sin omisiones ni base remota. `npm run validate` vuelve a dar 10 aprobadas/15 fallidas por respaldo privado ausente; no se modifica ese criterio. La última suite general ejecutada antes del último ajuste de exportación dio 65 aprobadas y 3 optativas omitidas; repetir al cerrar el commit.
- Siguiente tarea iniciada de forma independiente: validar horizontes 3/6/12 mediante selección anidada en cada origen, conservando API actual. No está incluida como completada aquí. No confundir evaluación a un paso con precisión multimes.
- Próxima acción: cerrar `npm run ui:test`, `npm run check` y `npm test`; revisar diff, commitear/pushear el hito; después integrar diagnósticos multihorizonte y actualizar esta evidencia con SHA exacto.

### Recuperación tras el siguiente límite — 31/10/2026
- Se volvieron a comprobar árbol, índice, diff, historial y ramas: no se perdieron los archivos del hito. Remoto confirmado en `de8f643` antes del nuevo commit.
- Repetición inicial: 72 tests Node aprobados/3 optativas omitidas; la regresión de Sheets falló por uso inconsistente de reloj inyectado y reloj del sistema al cumplirse 24 horas reales. Se corrigió la decisión temporal de reconciliación y planificación para usar el reloj del sincronizador; Sheets vuelve a 13/13.
- `forecast_horizons` dejó implementados y probados seis nuevos contratos de evaluación anidada a 3/6/12 meses y amplió la referencia Statsmodels/Polars. Sus archivos se conservan, pero se confirmarán en un commit separado tras revisión y exposición en la UI.
- El runner visual aún necesita cerrar su recorrido de descargas; los 225 recorridos y auditorías iniciales no se confunden con ese cierre pendiente. No certificar el hito visual completo hasta leer su reporte exitoso.

## Recuperación después de límite/cuota o nueva conversación
1. Reabrir este repositorio/entorno Codex publicado.
2. Leer `AGENTS.md` y este checkpoint, mirar SHA real y git status/diff.
3. Continuar el siguiente hito pendiente: NO repetir instalaciones ni devolver un informe largo en vez de programar.
4. Hacer commits incrementales y checkpoint antes de finalizar cada iteración.

**Importante:** Guardar contexto no crea una reactivación automática de Codex al recuperar cuota. Los cambios sin commit pueden no existir en una nueva tarea aislada.
