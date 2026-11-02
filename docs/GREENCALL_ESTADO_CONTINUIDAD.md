# ESTADO VIVO Y CHECKPOINT — GreenCall Supply Chain & Inventory BI (Codex + Claude)

> Este documento SE DEBE ACTUALIZAR EN CADA HITO VERIFICADO y commitear. En nueva tarea, se lee junto con AGENTS.md. No escribir secretos ni datos personales.

## Estado vigente para retomar — 02/11/2026 (Claude Code, rama `claude/sweet-lovelace-dltfpk`)
- **Rama de trabajo única de Claude:** `claude/sweet-lovelace-dltfpk` (asignada por la sesión Cloud; equivale a la rama aislada `claude/greencall-integracion-v2` sugerida). PR borrador propio: https://github.com/greencallCR-cloud/GreenCall_SupplyChain_Dashboard/pull/2 → `develop-cloud`. El PR #1 de Codex (`codex/greencall-v2`, `f7f8c56`) queda intacto y en borrador.
- **Integración (hecha):** merge no destructivo `11e703f` de `origin/codex/greencall-v2` (`f7f8c56`) sobre la preparación Claude (`31ad1ae`). Base común `bc8429c`. Sólo `.gitignore` y este checkpoint se tocaban en ambas ramas; fusión automática revisada sin pérdidas. Se conservan `.claude/skills` (12), `CLAUDE.md`, `tools/claude-setup/`, `vendor/claude-plugins`, API protegida, snapshots, CSV, forecast multihorizonte y CI de Codex.
- **Hito B — Tomas físicas Cloud (implementado y verificado con fixtures + PostgreSQL desechable):** commits `829263f` (núcleo, bitácora, servicio), `c544fbb` (rol admin, API, UI), `b635e25` (correcciones de seguridad). Ver «Hito 2026-11-02 — Tomas físicas Cloud» abajo y `docs/GREENCALL_CLOUD_V2_OPERACION.md`.
- **Pruebas actuales:** `npm run ui:test` 225/52/22 aprobados (ver hito abajo); `npm run check` 60 archivos; `npm test` 103 aprobadas / 0 fallos / 2 omitidas (benchmarks opt-in); Sheets 13/13; hardening 9/9; PostgreSQL 16 local por socket: snapshot-store + physical-service aprobados; benchmark 175k sintético aprobado con `GREENCALL_BENCHMARK_SNAPSHOTS=1`.
- **Bloqueos del titular (sin cambio):** el contenedor no tiene `DATABASE_URL`, `NEON_API_KEY`, `VERCEL_TOKEN` ni OAuth Google (`gws` sin auth). No se tocó Neon remoto, Vercel, Sheets ni producción. Falta histórico privado (`npm run validate` sigue con 15 fallos esperados).
- **Próxima acción exacta:** (1) con credencial de una rama Neon de desarrollo: aplicar `db/migrations/20261102_001_physical_imports.sql`, crear el rol escritor descrito en el doc de operación y configurar en Preview `GREENCALL_ADMIN_KEY` + `GREENCALL_PHYSICAL_DATABASE_URL`; (2) límite persistente de intentos/lotes (hallazgo 5 de seguridad); (3) Hito C/D: continuar rediseño y KPIs con trazabilidad; (4) Hito E: revisar forecast por SKU/UDM con datos reales cuando exista snapshot privado.

## Estado previo (Codex) — 31/10/2026, 15:53 America/Costa_Rica
- Rama publicada: `codex/greencall-v2`, basada en `develop-cloud`; PR #1 permanece en borrador. No reiniciar desde `main` ni rehacer los hitos siguientes.
- Código de aplicación verificado: `8b7d3b76a51ea5a7cf3702b1d07896ba46567bea`; CI añadido en `e093cce704940f6d690277684c257770e2fa906e`. El último commit de documentación se consulta con `git log -1`; no se intenta incluir su propio hash dentro de sí mismo.
- Resultado final local: 73 tests Node aprobados y tres optativas omitidas; Sheets 13/13, hardening 9/9. PostgreSQL aislado + límites/175k: 23/23. Validación estadística: 27/27 y referencia independiente sintética. UI final: 225 recorridos, 52 auditorías axe sin violaciones detectadas y 22 flujos, sin overflow. Dieciséis auditorías tienen comprobaciones SVG/Plotly no resueltas automáticamente; no equivale a certificación WCAG completa.
- CI real de `e093cce`: **cuatro jobs aprobados** (Node 22, Node 24, integridad PostgreSQL, referencia estadística), run `41245525373`. Se deduplican eventos push/PR por rama en la configuración posterior.
- Vercel confirmó success para `8b7d3b7`. Preview observado: `https://greencall-supplychain-da-git-8b820b-greencallcr-clouds-projects.vercel.app`; el visitante sin credenciales recibe SSO. No se certificó API autenticada remota.
- Bloqueos: entorno sin credenciales runtime para Sheets/Neon ni claves de acceso Cloud. Falta el histórico privado; QA histórica conserva 15 fallos explícitos. No hay cambios remotos de esquema, costos o fuentes.
- Próximo hito: importación física persistente Cloud con rol de escritura separado y activación CAS; después medición real de lecturas/agregados Neon en una rama aislada. Antes de conectarla, comprobar secretos y roles sin imprimir valores. Mantener Sheets sólo lectura.

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

## Hito de validación multihorizonte — 31/10/2026
- Hito de integridad/exportaciones confirmado y publicado en `70cd5fdbb7b1893bb9bc522604146f7e34fe9e1a`. GitHub confirmó Vercel success para ese SHA. Se mantiene PR #1 en borrador; no se integró a `develop-cloud` ni `main`.
- `src/forecast.mjs`: evaluación externa anidada a 3/6/12 meses. En cada corte se repite la selección sobre el prefijo de entrenamiento y se compara con naïve en los mismos objetivos. Se exigen tres cortes completos, máximo seis; métricas nulas si falta evidencia. Se documenta el solapamiento y no se inventan intervalos.
- UI: selector de horizonte actualiza una tabla independiente para material y órdenes, con MAE/WAPE/sMAPE, baseline, cortes y tramos evaluados. Las métricas de selección a un mes permanecen etiquetadas como tales.
- Revisión independiente `horizon_final_review` encontró un P2: los meses parciales desplazaban las predicciones, pero no los plazos de validación. Test rojo reproducido y corrección verde: ambos usan el mismo desplazamiento; los tramos se muestran en pantalla. No quedaron otros hallazgos materiales en esa revisión.
- Pruebas estadísticas: 27/27, incluida perturbación de objetivos futuros sin alterar selección/predicción del corte. Referencia independiente Statsmodels/Polars repetida: coincide en los 18 cortes externos sintéticos y métricas; no es validación del histórico operativo. Benchmark separado de 44 series sintéticas × 53 meses: 101 ms y 894.304 bytes de resultados en esta máquina; no extrapolar a p95 remoto.
- Suite técnica repetida después de la corrección: 73 aprobadas, tres optativas omitidas; Sheets 13/13, hardening 9/9; sintaxis de 47 archivos. PostgreSQL/frontera/175k del hito anterior: 23/23.
- Cierre visual anterior repetido por el agente principal: **225 recorridos, 52 auditorías axe y 20 flujos aprobados**. Artifacts locales `/workspace/work/ui-regression-full/`. La última tabla de horizontes está en repetición completa adicional; no se confunde con ese reporte. Las comprobaciones SVG/Plotly que axe no resuelve requieren revisión manual.
- Próxima acción inmediata: leer `/workspace/work/ui-horizon-final/results.json` y `work/ui-horizon-final.log`; corregir cualquier fallo, registrar SHA del commit de este hito y verificar su Preview. Después priorizar importación física persistente Cloud y medición de lecturas Neon con una rama/credencial de desarrollo disponible; no introducir datos o secretos en Git.

### Cierre verificado de los hitos
- `70cd5fd`: integridad de snapshots, worker concurrente, exportaciones privadas, accesibilidad y reloj coherente del sincronizador.
- `8b7d3b7`: selección externa anidada, plazos parciales alineados, tabla multihorizonte y referencias reproducibles. Publicado y Preview success.
- `e093cce`: CI real sobre la rama de desarrollo. Run https://github.com/greencallCR-cloud/GreenCall_SupplyChain_Dashboard/actions/runs/41245525373 con los cuatro jobs aprobados; no usa secretos ni datos operativos. El job PostgreSQL ejecuta los casos optativos omitidos en el job Node.
- Reporte final de navegador leído: `/workspace/work/ui-horizon-final/results.json`, `success:true`, 225 recorridos, 52 auditorías, 22 flujos, cero violaciones detectadas y cero overflow. Capturas de escritorio/móvil inspeccionadas. Toda pantalla poblada del runner usa fixtures sintéticos explícitos; las capturas públicas sin datos no revelan operación.
- Revisiones materiales cerradas con pruebas: integridad/corrupción/CAS, preservación física, límite JSON, tipo inicial del explorador, contraste, foco modal, skip link, diferencia entre captura y sincronización y desplazamiento temporal del backtest. Pendientes declarados: revisión visual manual de SVG, autenticación individual/roles y rate limit persistente antes de producción, histórico real y backend autorizado, persistencia física Cloud y rendimiento remoto.
- Workspace y rama se conservan para continuar; no se crea automatización de reanudación ni se promete ejecución futura sin tarea activa.

## Hito 2026-11-02 — Preparación de Claude Code (sin cambios de aplicación)
- Rama `claude/sweet-lovelace-dltfpk` (fast-forward desde `develop-cloud` `bc8429c`).
- Skills de proyecto en `.claude/skills/` (+ `skills-lock.json`), plugin local `build-web-data-visualization`, `CLAUDE.md`, `tools/claude-setup/`.
- Detalle, pruebas, persistencia y bloqueos: `docs/CLAUDE_CODE_ENTORNO_CHECKPOINT.md`.
- Tests: `npm run check` OK; `npm run cloud:test` 6/6; `validate`/`start` bloqueados por falta de `local-data/base.json` (privado).
- Próxima acción: nueva sesión → `bash tools/claude-setup/setup.sh` → primer hito vertical según `AGENTS.md`.

## Hito 2026-11-02 — Tomas físicas Cloud (Claude Code)
- **Rama/SHA:** `claude/sweet-lovelace-dltfpk`; integración `11e703f`; `829263f`, `c544fbb`, `b635e25` (+ commit de este checkpoint, ver `git log -1`).
- **Hallazgo Codex:** la importación física persistente Cloud mencionada como «parcial» NO existía en ningún commit remoto; se implementó desde cero. No se afirma haber recuperado trabajo local de Codex.
- **Diseño:** el snapshot privado sigue siendo la única fuente de lectura. Cada carga es un lote en `greencall_private.physical_import_batches` (append-only, una reversión por lote) y un nuevo snapshot inmutable activado con CAS en la **misma transacción** (`publishSnapshot({afterActivation})`). Conteos efectivos = legado + replay de lotes vigentes ⇒ revertir restaura el valor previo exacto. Sheets nunca se escribe; `captured_at` de Sheets no cambia.
- **Seguridad:** escritura sólo con sesión admin (`GREENCALL_ADMIN_KEY`, distinta de la clave de lectura, sesión ligada por HMAC a la clave), mismo origen, conexión de escritura separada (`GREENCALL_PHYSICAL_DATABASE_URL`). Sin ella: `SIN_CREDENCIALES` explícito. Revisión independiente (agente ecc:security-reviewer): sin hallazgos de auth/CSRF/SQL/XSS; corregidos con TDD bomba de descompresión XLSX y columnas absurdas, reimportación tras reversión, confirmación de bitácora y rotación de clave admin. Pendiente: límite persistente de intentos/lotes.
- **Validación de filas:** errores bloqueantes (fecha ausente/inválida/futura CR, técnico/SKU ausente, SKU 7005189, conteo ausente/negativo, fracción en PZA/UND, duplicado en conflicto) y avisos (SKU/técnico desconocido, unidad ausente/ambigua, serializado agregado, duplicado idéntico). Totales por unidad sin mezclar.
- **Navegador (Agent Browser 0.27, loopback, datos SINTÉTICOS, PostgreSQL desechable):** login admin; archivo con 5 errores → 5 observaciones por fila/campo y botón Aplicar deshabilitado; archivo válido → resumen, avisos y efecto (QA-UTP 120→85,5); aplicar → lote «Vigente», último conteo y consumo derivado recalculados; revertir → vuelve a 120 y queda «Revertido» + registro de reversión. 1440×900 y 390×844 sin overflow horizontal. Corregidos: vista previa atrapada en un scroll de 330 px y foco tapado por la barra fija (`scroll-padding-top`). Capturas sólo en el scratchpad de la sesión (no en Git).
- **QA visual heredada (`npm run ui:test`) repetida en este contenedor: 225 recorridos, 52 auditorías axe WCAG 2 A/AA con 0 violaciones, 22 flujos, 0 mensajes de consola y 0 errores de navegador** (datos sintéticos, loopback). Agent Browser 0.27 difiere de la versión de Codex; el runner ahora: inyecta axe-core 4.10.3 (devDependency fijada) por fragmentos si falta `a11y`; simula el fallo de red rechazando `fetch(/api/status)` si `network route --abort` no intercepta; desplaza el objetivo antes de `click` por selector; y recoge el CSV descargado si `wait --download` no lo renombra. Cada adaptación queda registrada en `limitations` del reporte.
- **Skills usadas con efecto:** superpowers:test-driven-development (ciclo rojo-verde en cada capa y en cada hallazgo), anthropic-skills:agent-browser (E2E y capturas), ecc:security-reviewer (agente). Neon/Vercel/gws no se usaron: sin credenciales.
- **Herramientas nuevas de prueba:** `tools/test-postgres.mjs` (contenedor o socket Unix local, sin red), `tools/test-xlsx.mjs` (XLSX reales, opcional deflate), `tools/qa-physical-cloud-server.mjs`.

## Recuperación después de límite/cuota o nueva conversación
1. Reabrir este repositorio/entorno Codex publicado.
2. Leer `AGENTS.md` y este checkpoint, mirar SHA real y git status/diff.
3. Continuar el siguiente hito pendiente: NO repetir instalaciones ni devolver un informe largo en vez de programar.
4. Hacer commits incrementales y checkpoint antes de finalizar cada iteración.

**Importante:** Guardar contexto no crea una reactivación automática de Codex al recuperar cuota. Los cambios sin commit pueden no existir en una nueva tarea aislada.
