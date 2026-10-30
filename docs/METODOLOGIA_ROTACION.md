# Rotación y quiebre de política

Rotación de consumo = **COUNT DISTINCT (orden, SKU)** del universo Consumos/Export1, excluidas descripciones de mano de obra; cantidad consumida por SKU y unidad se conserva como métrica diferente, nunca se suman M con PZA.

Rotación de despacho = **eventos** por técnico/SKU/fecha/acta, segregada de consumo. La precarga inicial dispone de 17366 eventos serializados del tab completo en dos vistas NO aditivas (mes/SKU y técnico/SKU) y 581 eventos no serializados únicamente de insumos operativos, agrupados por mes. El detalle de seriales individuales y otros no serializados se importa luego. Los reportes completos se incorporan mediante Excel.

`Rotación Técnicos` NO es rotación por frecuencia: es un snapshot de antigüedad/política de 3479 series, con 634 vencidas. `Devoluciones Rotación` es un snapshot por SKU/estado, también 3479 series. Ambos se presentan en la página **Quiebre de política** y no se suman entre sí (son perspectivas sobre series potencialmente solapadas).
