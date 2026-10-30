# Arquitectura independiente · GreenCall Supply Chain BI

- `public/index.html` + `public/assets/styles.css` + `public/assets/app.js`: SPA vanilla JS, shell cálido, navegación lateral responsive, tarjetas, tablas y visualizaciones Plotly **local**.
- `public/assets/plotly.min.js`: biblioteca estática proveniente del ZIP de referencia ODT (no se vincula con el proyecto original).
- `src/xlsx.mjs`: lector de XLSX/XLSM y CSV sin dependencias npm ni red, basado en ZIP central directory, shared strings y XML de hojas. Validación de formatos y límite de filas.
- `src/core.mjs`: firmas de fuente, mapeo de encabezados, normalización, SHA-256, claves de evento, consolidación idempotente, toma física, reconciliación SAP/ETA, ABC y forecast; `src/insights.mjs` agrupa despachos por acta/técnico+fecha, cobros por estado, taller y capital con IVA.
- `local-server.mjs`: Node HTTP (solo loopback), endpoints JSON, login efímero, staging import preview, atomic write, paginación y exportación CSV saneada.
- `local-data/base.json`: datos transformados (PII omitida) y orígenes. Incluye las 173.761 filas operativas saneadas del tab Consumos; no incluye datos personales ni CSV originales.
- `supabase/migrations/`: SQL preparado para revisión manual futura; **nunca ejecutado**.
- `src/index.js` y `wrangler.jsonc`: scaffold Cloudflare deshabilitando APIs productivas hasta contar con autenticación y conexión real.

## Escalabilidad

El backend calcula datos agregados; las tablas de detalle usan paginación `limit<=200`. Los archivos se leen en servidor, nunca se envían las 170.000 filas directamente al navegador. La caché de dashboards se invalida después de aplicar importaciones. La persistencia JSON local no reemplaza una base transaccional productiva: para concurrencia multiusuario se necesitará migrar a PostgreSQL / Supabase con RLS, validación y benchmarks propios.

## Precaución sobre visibilidad de administración

Las rutas `/api/import/preview`, `/api/import/apply` y `/api/config` (POST) requieren sesión. Las lecturas están diseñadas para uso exclusivo en la máquina local. Se valida cabecera host y origen, pero no debe exponerse este servicio en Internet.

## Fuente principal v1.4

Google Sheets API (solo lectura) → read adapter `src/sheets-sync.mjs` → validación y reemplazo atómico → `local-data/base.json` → KPIs existentes. El servidor local mantiene los 173.761 consumos ya precargados y se puede sincronizar por intervalos; consulte `GOOGLE_SHEETS_AUTOSYNC.md`.
