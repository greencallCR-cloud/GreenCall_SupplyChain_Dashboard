# Super ABC

- Eje ABC económico: valor consumido = SUM(qty × costo unitario acreditado) por SKU. Un solo renglón con costo desconocido invalida el valor **completo** del SKU (no se reemplaza por 0). Se intenta costo de catálogo con contexto centro/almacén/lote; si diverge y no hay selección fiable, se conserva pendiente.
- Eje ABC de frecuencia: apariciones distintas orden/SKU, no metros ni cantidad. Ambos ordenados descendentemente y acumulados Pareto 80%/95% configurables en diseño inicial.
- Clases A/B/C calculadas por **acumulado anterior al SKU** para incluir la línea que cruza cada umbral.
- Matriz 3×3 cuando ambos ejes tienen dato. Un SKU sin costo se clasifica como `Pendiente costo`, nunca `CA`, `CC` u otra clase engañosa.
- ABC de valor de inventario solo cuando inventario real y catálogo de costos estén cargados.

Los cortes ABC son criterios analíticos y no políticas GreenCall confirmadas.
