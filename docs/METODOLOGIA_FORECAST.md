# Pronósticos — métodos implementados y límites

**Órdenes:** `COUNT DISTINCT Número de Orden` usando el histórico `Consumos` Google; fecha de cierre como primer criterio y fecha de instalación cuando la primera no es válida. Nunca el tab ODT. Una orden que figura varias veces por SKU o unidad se cuenta **una vez**. Datos sin fecha válida no se ubican artificialmente en una semana/mes.

**Consumo sistémico:** por SKU catalogado y unidad verificada. Cantidad inválida, negativa, serial con cantidad distinta de 1 o cantidad anómalamente alta queda registrada en QA y se excluye del ajuste, sin eliminar la fila de la fuente. Las apariciones son pares distintos orden+SKU. Los insumos de toma física no se confunden con consumo sistémico.

**Insumos no ETA:** `Despachos No Serializados` con fecha y dos tomas físicas válidas cuando existan; demanda proxy por entrega. Para tasa de consumo físico real se requiere inicial+reposiciones-final, con devoluciones/traslados/ajustes acreditados. Si no, la estimación se marca condicional o no calculable.

**Selección:** candidatos naïve, medias móviles 3/6, suavizado exponencial simple, Holt, Holt amortiguado, naïve estacional, Holt-Winters aditivo/multiplicativo, Croston, SBA y TSB según longitud e intermitencia de la serie. Backtesting temporal de origen rodante con WAPE, MAE y sMAPE cuando hay datos suficientes; sin fuga temporal. Se muestran modelo, confianza y banda estimada si el error del backtest está disponible.

**Horizonte:** 12 meses de pronóstico; KPIs útiles a 3 y 6 meses. Si octubre 2026 es mes parcialmente observado se excluye del entrenamiento de tendencia y se proyecta desde noviembre, sin reetiquetar el histórico. Costos 13% IVA derivados **solo si existe costo unitario verificado**. No se recomienda un pedido de cantidad real si faltan parámetros de tiempo de suministro/cobertura.
