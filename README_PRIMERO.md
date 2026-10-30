**Actualización de continuidad v1.4.1:** lea primero `README_V141.md` y `docs/AUDITORIA_Y_MATRIZ_V141.md`. La documentación v1.4 anterior se conserva como historial.

# GreenCall Supply Chain & Inventory BI · v1.4

**Aplicación Windows lista para uso local con datos históricos precargados.**

## Iniciar

1. Extraiga **todo** el ZIP en una carpeta con permisos de escritura. Contiene una única carpeta raíz `GreenCall_SupplyChain_Dashboard_v1.4`.
2. Instale Node.js **18 o superior** si no lo tiene. No se requiere `npm install` ni una base SQL; los datos precargados funcionan sin Internet, pero la sincronización automática requiere acceso a Google Sheets.
3. Haga doble clic en **`RUN_LOCAL.cmd`**. Se abrirá `http://127.0.0.1:8788` o el primer puerto libre hasta 8798. Conserve la consola abierta.
4. El dashboard ya contiene el histórico `Consumos` del Google Sheets, 173.761 filas de datos saneados y demás fuentes que pudieron obtenerse.
5. Para Administración use la **clave temporal indicada en la consola**. No está en el ZIP ni modifica Google Sheets automáticamente.
6. Para validar, ejecute **`VALIDATE_LOCAL.cmd`**. Reportes en `docs/QA_FINAL.md`.

## Indicadores principales precargados

- 17.290 órdenes de trabajo distintas **con fecha válida**, calculadas exclusivamente desde `Consumos`.
- 139.554 líneas de materiales válidos y catalogados, 116.197 apariciones distintas material-orden.
- Despachos integrados: 20.321 líneas y 478 órdenes conciliables por acta o técnico+fecha; otras 654 líneas están sin datos suficientes.
- Inventario Real: 3.707 registros, 23 ubicaciones (incluye bodega); **₡106.001.382,14 sin IVA**, **₡119.781.561,82 con IVA** en el corte del origen 25/10/2026.
- Predicciones por órdenes únicas y 44 series de materiales/insumos, con modelos candidatos y métricas de validación. Insumos no ETA = **proxy de despachos**, no consumo confirmado.
- Cobros y taller en páginas independientes, con clasificación `Cobrado`, `Justificado` o pendiente.

## Límites de precisión

La hoja `Consumos` tiene 173.761 filas realmente exportadas, pero **no todas las columnas/fechas son válidas**. El valor total del consumo material y algunas proyecciones monetarias permanecen pendientes cuando falta un costo inequívoco o aparece una cantidad atípica; no se inventan precios ni se mezclan unidades. En el catálogo se encontró un contexto sin costo (`4011388`, R859/Q000/NOVALORADO). Algunas columnas derivadas por fórmulas de las pestañas de despachos no se conservaron en la exportación aislada; consulte `docs/QA_FINAL.md`.

**Privacidad y seguridad:** el ZIP contiene filas operativas saneadas; excluye nombre/identificación de clientes, archivos originales Excel/CSV y contraseñas. No se cambió el documento original ni sistemas productivos. Solo se usaron copias temporales de extracción que fueron eliminadas.

## Google Sheets automático (v1.4)

El dashboard v1.4 incorpora una **conexión de solo lectura** con Google Sheets por cuenta de servicio. Abra `CONFIGURAR_GOOGLE_SHEETS.cmd` o `docs/GOOGLE_SHEETS_AUTOSYNC.md` para configurarla. La app sigue funcionando sin Internet con los datos locales precargados. La clave no está incluida; sincronización activa requiere una cuenta de servicio que tenga acceso lector al documento principal. Mientras el servidor esté encendido, consulta cambios cada 10 minutos y reconcilia la historia completa cada 24 horas.
