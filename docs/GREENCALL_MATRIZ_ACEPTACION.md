# Matriz mínima de aceptación (actualizar con enlaces a pruebas)
La palabra «VERIFICADO» requiere evidencia de código + prueba + fuente/corte; «PARCIAL» exige detallar límites. No marcar todo verde por aparecer UI.

| ID | Requisito | Prueba mínima y evidencia esperada | Estado inicial |
|---|---|---|---|
| SEC01 | API autenticada y datos internos restringidos | petición anónima no entrega stock/costos/series; log sin secretos | NO VERIFICADO |
| SEC02 | Históricos fuera de GitHub/webroot | inspección repo, Vercel deployment y Git history | PARCIAL: gitignore en develop-cloud |
| DATA01 | Consumos completos | conteo de origen por corte, hash y conciliación sin pérdidas | NO VERIFICADO CLOUD |
| DATA02 | Órdenes únicas | 8 líneas misma orden = 1 orden; fecha válida | NO VERIFICADO CLOUD |
| DATA03 | Apariciones `(orden,SKU)` | 4 líneas mismo par = 1 aparición | NO VERIFICADO CLOUD |
| DATA04 | UDM no mezcladas | M, PZA, ML separados; cero vs desconocido | NO VERIFICADO CLOUD |
| DATA05 | Catálogo y costos | SKU+centro+almacén+lote y IVA 13%, faltantes no cero | NO VERIFICADO CLOUD |
| DISP01 | Despachos integrados | 12 series una acta = 1 evento, ambas pestañas unidas | NO VERIFICADO CLOUD |
| INV01 | Inventario real por ubicación | bodega+todos técnicos; filtros, corte y conciliación | NO VERIFICADO CLOUD |
| INV02 | SAP/ETA | excluir no SAP/consumida/devuelta/cobrada; último despacho; ETA no físico | NO VERIFICADO CLOUD |
| PHYS01 | Excel físico | preview, dos tomas por técnico/SKU, ajustes, idempotencia y rollback | NO VERIFICADO CLOUD |
| ABC01 | Super ABC | valor y frecuencia, matriz y sin costos falsos | NO VERIFICADO CLOUD |
| FCAST01 | Órdenes y SKU | cortes mensuales, baseline y modelo por serie | NO VERIFICADO CLOUD |
| FCAST02 | Selección estadística | rolling-origin sin fuga, WAPE/MAE/sMAPE, intermitentes | NO VERIFICADO CLOUD |
| FCAST03 | No serializados | despacho como proxy, consumo físico con dos conteos | NO VERIFICADO CLOUD |
| SYNC01 | Actualización Sheets | readonly, schema drift, reintentos, filas nuevas/corregidas, integridad | NO VERIFICADO CLOUD |
| UX01 | UI profesional | diseño y tooltips, código/descripcion, filtros, mobile/tablet/desktop | NO VERIFICADO NUEVA VERSIÓN |
| OPS01 | Vercel API | Preview `/api/status`, `/api/dashboard`, `/api/rows` y errores adecuados | PARCIAL: Preview Ready |
| OPS02 | Neon | permisos, schema, rendimiento, pruebas transaccionales y recovery | PARCIAL: base creada |
| OPS03 | Continuidad | AGENTS leído, checkpoint y commit reproducible | PREPARADO EN KIT, NO APLICADO |
