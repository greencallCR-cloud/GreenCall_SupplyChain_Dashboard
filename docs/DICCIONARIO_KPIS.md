# Diccionario auditable de indicadores · v1.3

- **Órdenes cerradas:** distinct `Número de Orden` con fecha válida desde `Consumos` Google; no contar por fila/serie/SKU.
- **Líneas consumo catalogadas:** filas del tab `Consumos` con orden/fecha y SKU del catálogo, excluyendo servicios y 7005189.
- **Apariciones:** `COUNT DISTINCT(orden,SKU)` por período. No son cantidades físicas.
- **Cantidad por SKU:** SUM de cantidades válidas del mismo SKU, interpretadas exclusivamente en su unidad (PZA, M, ML). Los DROP preconectorizados son PZA; UTP exterior M; tensores, cinta, cleaver y maja dedos PZA. Sin KPI de cantidad total mezclada.
- **Valor histórico consumo:** cantidad válida × costo contextual de catálogo (centro, almacén, lote) cuando sea único; si falta, KPI monetario total = No calculable y se reporta subtotal verificable por separado.
- **Órdenes únicas despacho:** acta normalizada de la misma entrega entre pestañas; si falta acta, técnico canónico+fecha válida. Si faltan ambos, pendientes sin imputación. Líneas y series son KPIs aparte.
- **Capital por ubicación:** SUM(`Inventario Real`.`Valor total ₡`) para filas INCLUIDO del corte, bodega y todos los técnicos, sin duplicar SAP/ETA/rollup. Base sin IVA, IVA=base×13%, total=base+IVA.
- **Costo por contexto:** SKU + centro + almacén + lote. Si el origen trae un subtotal más IVA, usar esos importes y no gravar de nuevo.
- **Tasa de despacho operativa:** despachos válidos técnico+SKU en intervalo ÷ órdenes cerradas del mismo técnico y período en `Consumos`. Proxy, no consumo real confirmado.
- **Consumo físico estimado:** saldo físico inicial + entregas/reposiciones acreditadas - saldo final de dos conteos válidos; registrar ajustes y anomalías; tasa por órdenes en ese intervalo.
- **Super ABC económico:** Pareto por valor consumido acreditado; **Super ABC frecuencia** por apariciones orden+SKU. Umbrales A 80%, B hasta 95%, C resto. Matriz AA–CC para materiales con costo y frecuencia comprobables.
- **Quiebre política:** antigüedad de series por snapshot; no sumar la misma serie de `Rotación Técnicos` y `Devoluciones Rotación`.
- **Cobros:** solo tab `Cobros`; Detalle Cobrado, Justificado, Pendiente. Excluir 7005189. Base/IVA/Total según origen.
- **Devoluciones taller:** eventos del tab correspondiente; reincidencia de serie si repetida; tasa de daño sin denominador comparable = No calculable.
- **Pronóstico:** pronósticos mensuales por órdenes únicas y cantidad por SKU; modelos validados cuando hay histórico y costos con IVA/sin IVA solo si son acreditados.
