# Matriz mínima de aceptación (actualizar con enlaces a pruebas)
La palabra «VERIFICADO» requiere evidencia de código + prueba + fuente/corte; «PARCIAL» exige detallar límites. No marcar todo verde por aparecer UI.

| ID | Requisito | Prueba mínima y evidencia esperada | Estado inicial |
|---|---|---|---|
| SEC01 | API autenticada y datos internos restringidos | petición anónima no entrega stock/costos/series; log sin secretos | VERIFICADO EN TEST: auth/API/HTTP, cookie/origen/expiración. Preview con SSO; falta prueba autenticada externa |
| SEC02 | Históricos fuera de GitHub/webroot | inspección repo, Vercel deployment y Git history | PARCIAL: gitignore en develop-cloud |
| DATA01 | Consumos completos | conteo de origen por corte, hash y conciliación sin pérdidas | NO VERIFICADO CLOUD |
| DATA02 | Órdenes únicas | 8 líneas misma orden = 1 orden; fecha válida | CONTRATO VERIFICADO: snapshot-store/domain-integrity; contraste conectado de columnas mínimas, sin snapshot privado integral |
| DATA03 | Apariciones `(orden,SKU)` | 4 líneas mismo par = 1 aparición | CONTRATO VERIFICADO: snapshot-store; falta paridad operativa Cloud |
| DATA04 | UDM no mezcladas | M, PZA, ML separados; cero vs desconocido | NO VERIFICADO CLOUD |
| DATA05 | Catálogo y costos | SKU+centro+almacén+lote y IVA 13%, faltantes no cero | NO VERIFICADO CLOUD |
| DISP01 | Despachos integrados | 12 series una acta = 1 evento, ambas pestañas unidas | NO VERIFICADO CLOUD |
| INV01 | Inventario real por ubicación | bodega+todos técnicos; filtros, corte y conciliación | NO VERIFICADO CLOUD |
| INV02 | SAP/ETA | excluir no SAP/consumida/devuelta/cobrada; último despacho; ETA no físico | NO VERIFICADO CLOUD |
| PHYS01 | Excel físico | preview, dos tomas por técnico/SKU, ajustes, idempotencia y rollback | NO VERIFICADO CLOUD |
| ABC01 | Super ABC | valor y frecuencia, matriz y sin costos falsos | NO VERIFICADO CLOUD |
| FCAST01 | Órdenes y SKU | cortes mensuales, baseline y modelo por serie | NO VERIFICADO CLOUD |
| FCAST02 | Selección estadística | rolling-origin sin fuga, WAPE/MAE/sMAPE, intermitentes | VERIFICADO CON FIXTURES: selector h=1 y evaluación externa anidada h=3/6/12; plazos desplazados por meses parciales, 27 tests y referencias Statsmodels/Polars. Falta certificación operativa |
| FCAST03 | No serializados | despacho como proxy, consumo físico con dos conteos | NO VERIFICADO CLOUD |
| SYNC01 | Actualización Sheets | readonly, schema drift, reintentos, filas nuevas/corregidas, integridad | ADAPTADOR VERIFICADO: qa_sheets_sync 13/13; worker con bloqueo/CAS y preservación física. Falta credencial del runtime |
| UX01 | UI profesional | diseño y tooltips, código/descripcion, filtros, mobile/tablet/desktop | VERIFICADO CON FIXTURES: 225 recorridos, 52 auditorías axe sin violaciones detectadas y 22 flujos, incluida ampliación de horizontes. SVG/Plotly requiere revisión manual adicional |
| OPS01 | Vercel API | Preview `/api/status`, `/api/dashboard`, `/api/rows` y errores adecuados | PARCIAL: de8f643 Ready; URL observada protegida con 302 a SSO. Handlers/errores verificados por HTTP local |
| OPS02 | Neon | permisos, schema, rendimiento, pruebas transaccionales y recovery | POSTGRESQL DESECHABLE VERIFICADO: inmutabilidad, activación, corrupción y CAS; benchmark sintético. Neon remoto no configurado aquí |
| OPS03 | Continuidad | AGENTS leído, checkpoint y commit reproducible | VERIFICADO: de8f643, 70cd5fd, 8b7d3b7 y e093cce publicados; PR #1 en borrador hacia develop-cloud; CI real aprobado |
| EXP01 | Exportaciones privadas | sesión, filtros, búsqueda, CSV seguro, tamaño acotado | CONTRATO VERIFICADO: cloud-export.test; falta fuente operativa privada en Preview |
