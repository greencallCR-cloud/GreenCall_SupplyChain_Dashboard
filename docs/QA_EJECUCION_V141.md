# QA ejecutado sobre GreenCall v1.4.1 (30/10/2026)

**Plataforma de ejecución:** Linux, Node.js v22.16.0. No se ejecutaron scripts `.cmd` directamente ni se modificaron sistemas en producción.

| Comando o alcance | Resultado real |
|---|---|
| `npm run check` | PASS (sintaxis del servidor, módulos y frontend) |
| `npm run validate` | PASS: `qa.mjs` 25/25, `qa_extended.mjs` 17/17, `qa_sheets_sync.mjs` 13/13 y `qa_hardening.mjs` 9/9 = **64/64** |
| `npm run http-qa` | PASS: **13/13** verificaciones en servidor local independiente: versión, rutas, paginación, login, seguridad, lectura real de datos, exportes |
| `npm run perf` | Historial 173.761 consumos, 17.290 órdenes, motor 44 SKU, memoria RSS ≈425 MB, análisis ~6,3 s en esta máquina; varía según equipo |
| Inicio manual `node local-server.mjs` | PASS: escuchó en `127.0.0.1:8788`, `/api/status` HTTP 200, `/api/dashboard` HTTP 200, `/api/rows` HTTP 200 |
| Sync Google Sheets (cuenta de servicio real) | **NO EJECUTADO**: sin clave autorizada; tests de HTTP simulados PASS |
| Browser QA escritorio/móvil en edición v1.4.1 | **NO CERTIFICADO**: intentos Chromium headless expiraron sin captura nueva; las capturas de docs/QA_VISUAL son anteriores |
| Windows `.cmd` | **NO EJECUTADO**: requiere Windows |

**Interpretación:** la aplicación se inicia, calcula y ofrece su API local sobre el snapshot real. Los tests no certifican la conexión real a Google ni la compatibilidad visual integral de todos los módulos. `qa_sheets_sync` simula las respuestas de Google y valida inserciones intermedias, borrado inesperado, errores de lectura y idempotencia. `qa_hardening` simula rollback de importación e inyección CSV.
