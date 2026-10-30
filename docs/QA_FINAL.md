# QA FINAL · GreenCall Supply Chain & Inventory BI v1.3

**Ejecución:** 28/10/2026, entorno Node.js 22 y Python/Chromium (Windows NO disponible en este entorno). Se modificó la aplicación v1.2 preexistente, se conservó el servidor Node local, Plotly y ambos scripts CMD. `RUN_LOCAL.cmd` requiere Windows con Node.js 18+; se probó su equivalente `node local-server.mjs` en Linux.

## Resultados comprobados

| Comprobación | Resultado |
|---|---|
| `npm run check` | PASS, módulos/sintaxis |
| `npm run validate` | **42/42 PASS** (25 base + 17 extendidas), datos, IVA, despacho, costos, parser, privacidad y dedup |
| `npm run perf` | **173.761 filas reales**, ~3,2 segundos, ~427 MB RAM, 17.290 órdenes, 44 pronósticos de SKU/insumos |
| API HTTP local | **13/13 PASS**, estado, datos, filtros fecha/SKU, paginación, imágenes y Plotly local, rutas admin HTTP 401 sin sesión |
| Navegador Chromium | **14/14 pestañas**, DOM renderizado, 0 errores JS/console, sin overflow a 1440 px ni a 390 px; sidebar móvil abre/cierra y navega; 10 capturas |
| Prueba de navegador HTTP directo | **BLOQUEADA** por política de red del navegador en sandbox (`ERR_BLOCKED_BY_ADMINISTRATOR`). Se cargaron HTML/CSS/JS/Plotly reales en Chromium y se inyectaron respuestas reales HTTP de `api/dashboard`, conservando navegación y gráficos; verificar en Windows final. |
| Importador CSV masivo (aislado) | **PASS**: lector local cargó 58.207.581 bytes, 173.762 filas incl. cabecera, detectó tab `google_consumos`, 173.761 filas parseadas; ~4,2 segundos, ~1,05 GB RAM máximo |
| Scripts CMD en Windows | **NO EJECUTADOS**: requiere equipo Windows real. Sintaxis y equivalente Node/NPM sí probados. |

## Conciliación de fuentes

CSV de Consumos completo en filas: **173.761**, de 2022-06-16 a 2026-10-25. **17.290 órdenes únicas con fecha válida**; las órdenes ausentes o sin fecha se informan en `RECONCILIACION_CONSUMOS.json`. Materia prima para indicadores: **139.554 filas de material aceptadas**, **116.197 apariciones distintas**. Se excluye mano de obra/servicios, SKU no registrado en catálogo y 7005189; no se suman cantidades en unidades distintas.

**Despachos:** 17.367 líneas serializadas + 2.954 no serializadas = **20.321 líneas**, **478 órdenes conciliables** (108 acta, 370 técnico+fecha), **654 líneas sin datos suficientes** (sin fecha/acta o técnico). No deben presentarse como órdenes conocidas. Algunas columnas calculadas de los despachos quedaron vacías o en cero al descargar pestañas aisladas, aunque tienen valores en el libro original: usar acta/técnico/fecha/serie verificables y marcar costo/descripción de esas líneas como incompletos; se evita contabilizar cero de fórmula rota como costo acreditado.

**Inventario:** 3.707 filas, **23 ubicaciones**, bodega y todos los técnicos presentes en el corte de 25/10/2026. Capital base **₡106.001.382,14**, IVA 13% **₡13.780.179,68**, total **₡119.781.561,82**, suponiendo importes de Inventario Real sin IVA. El catálogo tiene 50 registros pero el SKU **4011388** contexto R859/Q000/NOVALORADO aparece sin costo en la fuente; **20 materiales de consumos** carecen de costo total validable o cantidad consistente; **65 filas de saldo físico no ETA** tienen costo sin fuente. No se rellenaron con cero.

**Cobros:** 786 originales; 400 SKU 7005189 excluidos, 386 restantes: 1 Cobrado, 130 Justificados, 255 Pendientes. Taller: 624 eventos, con recurrencia por serie; tasa de fallo no calculable sin denominador de instalaciones correspondiente.

**Riesgos y trabajo residual:** 654 líneas de despacho irresolubles, varias columnas de despachos basadas en fórmulas se perdieron en exportación aislada, datos de corte físico insuficientes para algunas tasas, costo de ciertos SKU/pseudo SKU no acreditado, resultados monetarios del consumo global parciales, y pronósticos no equivalentes a pedidos automáticos sin lead time confiable. Validar uso real en Windows; no se realizaron migraciones ni escrituras productivas. Se eliminaron las copias temporales de lectura de Google Drive, y los CSV exportados sin sanear no se incluyen en el ZIP.

## Evidencia

`QA_AUTOMATICO.json`, `QA_RENDIMIENTO.json`, `QA_HTTP_V13.json`, `QA_NAVEGADOR.json`, `RECONCILIACION_CONSUMOS.json` y diez imágenes `QA_VISUAL/desktop_*` y `QA_VISUAL/mobile_*`. Los logos embebidos en las capturas de QA son recursos reales de `public/assets`; no son capturas de un navegador conectado en red al servidor.
