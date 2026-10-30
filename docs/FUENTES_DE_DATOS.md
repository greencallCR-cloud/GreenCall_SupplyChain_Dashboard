# Cobertura de fuentes — iteración 28/10/2026

La fuente de Google Sheets se consultó en **solo lectura**. Para superar la limitación HTTP 403/10 MB del exportador nativo, se duplicó **solo cada pestaña a un archivo temporal nuevo**, se descargó su CSV y se eliminó la copia. **El original no se editó**. El CSV de `Consumos` tiene 58.207.581 bytes y **173.761 filas de datos**, coincidiendo con 173.762 posiciones de cuadrícula incluida la cabecera. No se incluyó el CSV sin sanear en este ZIP.

| Dataset local | Filas reales | Origen |
|---|---:|---|
| `google_consumos` | 173.761 | Google tab Consumos (gid 1389073811) |
| `claro_export` | 2.392 | Export1 de base anterior, fuente subsidiaria NO aditiva |
| `inventory_real` | 3.707 | Google Inventario Real |
| `sku_catalog` | 50 | Google Catálogo SKUs |
| `technicians` | 36 | Google Tecnicos |
| `dispatch_serial` | 17.367 | Google Despachos Serializados |
| `dispatch_nonserial` | 2.954 | Google Despachos No Serializados |
| `physical_counts` | 831 | Toma física precargada en v1.2 |
| `rotation_tech` | 3.479 | Google Rotación Técnicos |
| `rotation_returns` | 3.479 | Google Devoluciones Rotación |
| `charges` | 786 | Google Cobros |
| `workshop` | 624 | Google Control Devoluciones Taller |
| `eta` | 8.425 | Google Existencias ETA |
| `sap_serials` | 3.983 | Google Series SAP |
| `sap_quantities` | 34 | Google Cantidades SAP |
| `receipts` | 19 | Recepciones reales existentes en v1.2 |

**Precisión:** La exportación de pestañas sueltas no conserva necesariamente los resultados de fórmulas que consultaban otras pestañas, particularmente descripción/precio en ciertos despachos. Se conservan las líneas y los campos originales existentes (acta, técnico, fecha, serie), pero *no* se consideran completas esas columnas derivadas. `Consumos` contiene las 173.761 filas físicas de su CSV; fechas y órdenes ausentes se cuantifican por separado. `Catálogo SKUs`: una entrada con SKU 4011388 carece de costo en el contexto R859/Q000/NOVALORADO. Ningún precio faltante se imputó como cero.

Los resúmenes previamente precargados de serializados, inventario, cobros y devoluciones se desactivaron cuando existe detalle, para evitar **duplicación** de movimientos o snapshots. Los SHA-256 de los CSV originales están en `local-data/base.json > sources` y `docs/COBERTURA_ORIGEN.json`. Datos personales de clientes y fuentes CSV/Excel completas quedaron **fuera del ZIP**.
