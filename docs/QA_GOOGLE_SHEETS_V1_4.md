# QA de la integración Google Sheets — v1.4

**Fecha:** 30/10/2026 · **Entorno:** Node.js 22, Chromium headless, mocks sin datos sensibles.

## Resultados comprobados

- Motor base: **25/25** pruebas correctas (`tools/qa.mjs`).
- Batería ampliada: **17/17** pruebas correctas (`tools/qa_extended.mjs`).
- Nuevo conector: **11/11** pruebas correctas (`tools/qa_sheets_sync.mjs`): sin credenciales, validación de configuración, ingesta tipada, recibos con encabezado en fila 9, relectura completa idempotente, falla parcial sin reemplazo, nueva orden, corrección de cantidad existente, scope read-only y privacidad.
- Servidor real: `/api/status` responde con **173.761** filas `google_consumos`; `/api/sheets/status` reporta configuración deshabilitada; `/api/sheets/sync` responde **401** sin autenticación.
- Interfaz: evaluación de HTML, CSS, JS y JSON operativo servidos desde proyecto local en Chromium aislado. **Sin excepciones JavaScript**, **sin desbordamiento horizontal** a 1440 px ni 390 px. Panel Google Sheets visible y con 5 controles de gestión.

## Pendiente de validación externa

**NO se ha ejecutado el proceso OAuth con una cuenta de servicio real ni la primera sincronización de 173.761 filas por la API oficial** porque no se dispone de un archivo JSON autorizado. El conector está implementado y probado con mocks; el usuario debe crear y compartir la cuenta de lectura y pulsar `Probar acceso` / `Reconciliar todo`. El navegador de pruebas bloqueó apertura directa a `127.0.0.1`; para validar visualmente se inyectaron localmente los mismos recursos CSS/JS y respuestas de la API real en un documento aislado.

## Características verificables por inspección

- Servidor escucha solo en 127.0.0.1; OAuth usa `spreadsheets.readonly`.
- Toma en cuenta recortes por fila en Google, evita consultar nombre/cédula del cliente; no consulta `Tecnicos!E` (cédula).
- 2.500 filas máx. por bloque; cuota de 60 consultas/min por usuario respetada con limitador y backoff.
- Primer reemplazo conserva un backup local. Si falla una fuente, no escribe el snapshot parcial.
- Aplica sincronización periódica solo mientras el proceso Node está abierto.
