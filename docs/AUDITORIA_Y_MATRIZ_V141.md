# Auditoría de continuidad y matriz de implementación · 30/10/2026

## Alcance y precedencia

Base: ZIP v1.4 proporcionado, archivo `PROMPT_MAESTRO_CONTINUIDAD_GREENCALL_SUPPLY_CHAIN_BI_v1.4(1).md` y acceso de **solo lectura** al archivo Google `1gUK6b2eLyC2Al5opwiNb1r21-QAYrsJtncS37aP8nj8`. El anexo histórico llamado `Pasted markdown(20261030-151809).md` que menciona el Prompt Maestro **no fue adjuntado a esta iteración**; no se presumió su contenido. Referencia de diseño ODT y otros Excel originales no adjuntos a esta iteración no pudieron certificarse.

Los metadatos reales del 30/10/2026 muestran **38 pestañas**. Los valores de `gridProperties.rowCount` son capacidad de cuadrícula, NO el número de filas con datos.

| Pestaña | Filas asignadas en la fuente LIVE | Filas precargadas locales | Observación |
|---|---:|---:|---|
| Consumos | 173.762 | 173.761 (sin encabezado) | La última fila de la cuadrícula está poblada; coincidencia dimensional, no comparación íntegra de hashes |
| Inventario Real | 4.327 | 3.707 | La cuadrícula tiene filas vacías; corte precargado 25/10/2026 |
| Despachos Serializados | 17.648 | 17.367 | El extremo final de la cuadrícula está poblado; **existen más filas visibles que en el snapshot local**. Se necesita reconciliación autorizada antes de afirmar actualización completa |
| Despachos No Serializados | 2.955 | 2.954 | Dimensión compatible con encabezado; sin certificación total |
| Catálogo SKUs | 1.000 | 50 | Cuadrícula sobredimensionada; un contexto de costo local pendiente |
| Series SAP | 4.912 | 3.983 | Corte local 26/10/2026 |
| Existencias ETA | 8.823 | 8.425 | Corte local 26/10/2026 |
| Rotación Técnicos | 10.001 | 3.479 | Filas restantes asignadas a la cuadrícula |
| Cobros | 1.000 | 786 | Campo `Detalle` confirmado en lectura de encabezado |

**Alerta de integridad:** `Consumos` contiene `#ERROR!` en algunos campos calculados de sus filas finales de Google Sheets. El motor no inventa el técnico ante fórmulas erróneas. `Inventario Real` local tiene corte 25/10/2026, SAP/ETA 26/10/2026: no atribuir balances cruzados como si estuvieran auditados el mismo día. El historial conserva sus respectivos cortes.

## Mapa de requisitos

| Requisito | Fuente/módulo | Implementación/endpoint | Prueba | Estado verificable |
|---|---|---|---|---|
| Conservación de Consumos | `base.json`, `src/core.mjs` | `GET /api/status`, `/api/dashboard` | `qa.mjs`, `qa_http_v141.mjs` | **Completo para snapshot local (173.761)** |
| Órdenes únicas y apariciones | `Consumos`, catálogo | `analyze`, `/api/dashboard` | `qa.mjs` | **Validado en snapshot local** |
| Despachos con acta y sin acta | Despachos Ser/No Ser | `deriveInsights` | `qa.mjs` | **Validado en snapshot; live más extenso pendiente** |
| Inventario y capital por ubicación | Inventario Real, SKUs | `deriveInsights`, Inventario Real | `qa.mjs`, HTTP | **Validado en corte 25/10** |
| Separación SAP/ETA e inventario físico | SAP, ETA, toma física | `reconstructInventory`, `deriveBusiness` | `qa.mjs`, `qa_extended.mjs` | **Reglas probadas; conciliación multi-corte parcial** |
| Costos e IVA 13 % | Catálogo SKUs, Cobros | `priceLookup`, `deriveInsights` | `qa.mjs` | **Validado donde existe costo; sin imputar faltantes** |
| ABC dual valor/frecuencia | Consumos, SKUs | `analyze` | `qa.mjs` | **Validado con cobertura documentada** |
| Forecast y planning | Consumos y despachos proxy | `forecastOne`, `deriveBusiness` | `qa.mjs` | **Modelos ya existentes validados, no se prometen nuevos modelos** |
| Importadores 16 tipos | `src/core.mjs`, `src/xlsx.mjs` | `/api/import/preview`, `/apply` | `qa.mjs`, `qa_hardening.mjs` | **Endurecido / probado con fixtures; archivos nuevos no adjuntos** |
| Google Sheets cada 10 min / full 24h | `src/sheets-sync.mjs` | `/api/sheets/*` | `qa_sheets_sync.mjs`, HTTP | **Implementación y mocks PASS; credencial real pendiente** |
| Idempotencia y rollback | snapshots y Sync | `src/import-commit.mjs`, `saveData` | `qa_sheets_sync`, `qa_hardening` | **Probado con mocks / commits locales** |
| Seguridad | servidor, export CSV | login, host/origin, CSV | `qa_http_v141`, `qa_hardening` | **Endurecido; no equivale a auditoría externa** |
| UX de 14 secciones | `public/assets/app.js`, CSS | Navegación SPA | frontend servido por HTTP | **Preservado; QA visual nueva no certificada** |
| Ejecución Windows | `RUN_LOCAL.cmd` | Node v18+ | Node 22 Linux / HTTP | **Equivalente Node probado; .cmd en Windows pendiente** |

## Resultados del snapshot preservado

* Órdenes únicas válidas desde `Consumos`: **17.290**. Materiales válidos: **139.554 líneas**. Apariciones orden–SKU: **116.197** (indicador histórico documentado).
* Despachos: **20.321 líneas**, **478 eventos conciliables** (108 actas + 370 técnico/fecha), **654 líneas irresolubles**.
* `Inventario Real`: **3.707 registros**; capital sin IVA **₡106.001.382,14**, IVA **₡13.780.179,68**, capital con IVA **₡119.781.561,82**, corte 25/10/2026.
* Forecast: **44** series/pronósticos SKU disponibles en motor existente; sus proyecciones no deben convertirse en órdenes de compra automáticas sin lead time acreditado.
* Cobros: 786 líneas de origen; 400 de SKU 7005189 excluidas de los KPI correspondientes; 386 restantes (1 Cobrado, 130 Justificado, 255 Pendientes). Taller: 624 eventos.

Estos números son del ZIP, **no son KPIs vivos del 30/10/2026**. Tampoco su validación demuestra que todas las opciones comerciales o estadísticas pedidas estén implementadas al 100 %.

## Pendientes que requieren intervención autorizada o nuevos insumos

1. Configurar cuenta de servicio con permisos **Lector** fuera de la carpeta descomprimida y probar la primera sincronización completa **real**. El acceso que permitió leer metadatos aquí no se transfiere al servidor Node local ni constituye credencial de la aplicación.
2. Leer de nuevo la hoja `Despachos Serializados` completa; el origen vivo tiene una dimensión diferente del corte precargado. Revisar insertadas/modificadas con evidencias. **No** fabricamos esos movimientos en el respaldo.
3. Validar snapshots SAP, ETA e Inventario Real con fechas compatibles y ajustar cortes para conciliaciones. Completar costos de catálogo faltantes, fuentes físicas y lead time.
4. Ejecutar el `RUN_LOCAL.cmd` y QA responsive/visual real en Windows; las capturas históricas de `docs/QA_VISUAL` son evidencia de una edición anterior, no de la v1.4.1.
5. Revisión estadística profunda de forecasting en períodos parciales, políticas de 45 días, comparativos con ODT y nuevo diseño visual detallado: mantienen la implementación existente, pero **no se certifica** su cobertura total de cada criterio del prompt.
