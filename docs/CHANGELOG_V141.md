# GreenCall Supply Chain & Inventory BI · cambios v1.4.1

**30/10/2026.** Evolución incremental sobre la aplicación v1.4 adjunta; no es una reconstrucción ni un prototipo.

## Cambios implementados

1. **Seguridad transaccional en importadores.** La previsualización se ejecuta como antes. `src/import-commit.mjs` prepara TODOS los lotes seleccionados sobre un snapshot separado; si existe una hoja inválida, un preview vencido o un grupo mensual parcial, aborta la transacción sin tocar la base activa. El servidor publica la nueva base solo después de escritura atómica; el preview se conserva si falla el disco. Se respetan las reglas de no duplicación de `mergeRows`.
2. **Protección de sincronización.** `src/sheets-sync.mjs` compara identidad de las filas del solapamiento; una inserción, desplazamiento o cambio de identificación dispara reconciliación completa, en lugar de mezclar filas por `_sheet_row`. La reducción inesperada del histórico de Consumos se bloquea y preserva el snapshot. Una reducción de más de 0,5 % en otro conjunto operativo también se bloquea. Se aborta el sync si otra operación cambió la base mientras Google respondía.
3. **Estado verídico de Sheets.** Cuatro situaciones `PRECARGADOS`, `CONECTADO`, `ERROR` y `SINCRONIZANDO`; `CONECTADO` exige una lectura completada, no basta con tener conexión configurada. Mostrar último intento, última lectura exitosa, fuente y causa del error. Cambiar credencial o libro invalida cursores de sincronización anteriores.
4. **Menor exposición.** Se rechaza cargar JSON de credenciales almacenado dentro del directorio de la app; se mantienen fuera del ZIP. Se endureció verificación de Host, límites de intentos de acceso administrativo y el saneamiento de valores CSV para evitar ejecución de fórmulas al abrir exportaciones en programas de hojas de cálculo.
5. **Pruebas reproducibles.** Se añadieron `tools/qa_hardening.mjs`, `tools/qa_http_v141.mjs`, pruebas de inserción y borrado remotos en `tools/qa_sheets_sync.mjs`, y `npm run http-qa`. El script `VALIDATE_LOCAL.cmd` ahora incluye comprobaciones HTTP y rendimiento.
6. **Conservación funcional.** Permanecen los 14 módulos, Plotly local, catálogo, formatos CSV, motor de pronóstico, inventario, cobros, taller, importadores, todos los archivos históricos y los comandos Windows originales.

## Cambios expresamente NO realizados

No se editó el libro Google, Apps Script, Supabase, Cloudflare, GitHub ni Vercel; tampoco se añadieron credenciales al ZIP. No se sustituyeron cálculos actuales que no podían validarse con datos completos. La sincronización con cuenta de servicio real depende de una credencial autorizada local y permanece pendiente de prueba end-to-end, aunque su implementación y tests simulados están disponibles. Capturas visuales antiguas no certifican las modificaciones nuevas.
