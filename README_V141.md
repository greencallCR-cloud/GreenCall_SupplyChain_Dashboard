# GreenCall Supply Chain & Inventory BI · v1.4.1

**Aplicación local real sobre el código v1.4 y su respaldo histórico original.** No requiere SQL/Supabase para consultar los datos del ZIP. Se conservaron frontend, backend, 14 módulos, importadores, pronósticos, bases, plantillas y documentación histórica.

## Windows: iniciar en tres pasos

1. Descomprima **toda** la carpeta en una ubicación donde Windows permita escribir (ejemplo: `C:\GreenCallSupplyChain\`). No ejecute el `.cmd` dentro de una vista previa del ZIP.
2. Instale Node.js 18 o superior si no lo tiene y ejecute `RUN_LOCAL.cmd` con doble clic. Mantenga la consola abierta. Se abrirá el navegador en `http://127.0.0.1:8788` (puerto 8789–8798 si está ocupado).
3. Para administración, copie la **clave temporal** que aparece en la consola local. Para validar en Windows, ejecute `VALIDATE_LOCAL.cmd` (todas las pruebas toman tiempo y exigen memoria suficiente). No necesita `npm install` porque no hay dependencias npm externas.

## Datos que incluye este ZIP

* `local-data/base.json`: histórico precargado, **173.761 consumos reales**, sin clientela/identificaciones innecesarias, además de inventario, SAP, ETA, despachos, catálogo, cobros y taller del corte guardado.
* `public/`: dashboard y biblioteca Plotly local. `src/`: motor de cálculos, importadores, reconciliación y seguridad.
* `FORMATOS_IMPORTACION/`: formatos CSV de 16 tipos. `tools/`: QA reproducible. `docs/`: metodología y auditoría.

## Sincronización con Google Sheets

En `CONFIGURAR_GOOGLE_SHEETS.cmd` encontrará el manual. La app **no está conectada automáticamente a la cuenta Google de ChatGPT**: necesita una **cuenta de servicio Lector**, una clave JSON guardada **fuera** de la carpeta descomprimida, y compartir el libro con esa cuenta. Después, en Administración → Google Sheets, configurar, probar acceso y ejecutar lectura completa. Los siguientes ciclos tienen frecuencia 10 min (reconciliación completa 24 h), únicamente cuando el servidor local permanece encendido. Si falla, conserva el histórico y muestra error.

## Limitaciones reconocidas

El ZIP conserva el snapshot histórico original; la inspección de metadatos del Sheets vivo confirmó 38 pestañas y una dimensión mayor para Despachos Serializados, que **no se volvió a descargar íntegramente** por falta de autorización de una cuenta de servicio utilizable en el servidor. Tampoco se ha certificado el nuevo frontend mediante capturas completas ni los `.cmd` en Windows. Consulte `docs/AUDITORIA_Y_MATRIZ_V141.md`, `docs/QA_EJECUCION_V141.md` y `docs/CHANGELOG_V141.md`.
