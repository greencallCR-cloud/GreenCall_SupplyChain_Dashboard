# Guía de operación local · GreenCall v1.4

`RUN_LOCAL.cmd` inicia Node.js 18+ en `127.0.0.1` sin instalar paquetes y con datos locales; la conexión opcional de solo lectura con Google Sheets requiere Internet. La contraseña temporal aparece en la consola de ese proceso. Si el puerto 8788 está ocupado, pruebe 8789 a 8798. Cerrar la consola detiene el servidor. Es necesario extraer todos los archivos y conceder escritura a `local-data` para importar nuevos lotes.

La navegación contiene 14 módulos y gráficos Plotly locales. Las 173.761 filas históricas `Consumos` están **precargadas** y se consultan como agregados, no se dibujan todas de golpe. El detalle se consulta por la tabla paginada de **Detalle & calidad**. Utilice los filtros `Desde/Hasta`, SKU, técnico, centro, almacén y tecnología; los snapshots de inventario conservan su propio corte.

Para importar un futuro CSV/XLSX entre en Administración, desbloquee con la clave temporal, seleccione el archivo, pulse previsualizar y luego aplicar. Los encabezados determinan la fuente; mismo lote se deduplica según clave de negocio. **No suba CSV con clientes o identificaciones si no es necesario**, pues el importador conserva solo campos mapeados, y los importadores existentes se verifican con `VALIDATE_LOCAL.cmd`. La importación local no escribe en Google Sheets.

El CSV `Consumos` original ocupa ~58 MB y su lectura masiva requiere aproximadamente **1 GB de memoria RAM** en una prueba de importación. Para consultar la base precargada no se necesita volver a importarlo. La carga inicial `local-data/base.json` ocupa ~86 MB sin comprimir.

La tasa operativa de no ETA se expresa por técnico/SKU/unidad, con despachos ÷ órdenes cerradas del intervalo. El consumo físico estimado requiere dos conteos válidos y ajustes trazables; los valores negativos o anomalías no prueban consumo. Los datos sin costo verificado se muestran como pendientes. No se ofrece cantidad automática de pedido si falta lead time validado.

Detalle técnico y resultados: `docs/FUENTES_DE_DATOS.md`, `docs/RECONCILIACION_CONSUMOS.json`, `docs/DICCIONARIO_KPIS.md`, `docs/QA_FINAL.md`.

## Google Sheets automático (v1.4)

El dashboard v1.4 incorpora una **conexión de solo lectura** con Google Sheets por cuenta de servicio. Abra `CONFIGURAR_GOOGLE_SHEETS.cmd` o `docs/GOOGLE_SHEETS_AUTOSYNC.md` para configurarla. La app sigue funcionando sin Internet con los datos locales precargados. La clave no está incluida; sincronización activa requiere una cuenta de servicio que tenga acceso lector al documento principal. Mientras el servidor esté encendido, consulta cambios cada 10 minutos y reconcilia la historia completa cada 24 horas.
