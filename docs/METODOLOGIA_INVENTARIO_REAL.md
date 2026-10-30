# Inventario real · método y límites

Fuente primaria precargada: tab `Inventario Real` de GreenCall, corte 25/10/2026, 3707 filas con resultado INCLUIDO y ₡106001382,14, consolidado sin inventar series individuales en 372 grupos por ubicación/SKU/centro/almacén/lote. Los serializados y no serializados se distinguen; las cantidades se comparan **solo por SKU y unidad**. El importe CRC es agregable.

Se prefiere un conteo físico más reciente que tenga fecha válida + cantidad numérica y que no sea ANNULLED para un mismo técnico/SKU de material operativo. EXPIRED no invalida por sí mismo un conteo histórico. Se reemplaza el saldo de ese mismo técnico/SKU del inventario sistémico; no se suman ambos, para no duplicar stock. Sin costo inequívoco, el saldo físico tiene valor monetario desconocido, no cero. La visualización global ₡106 millones corresponde al valor de Inventario Real documentado, no suma valores desconocidos.

Para reconstrucción futura de series desde base: la serie debe existir en SAP vigente, no constar consumida/cobrada/taller sin reingreso; custodio = último despacho válido o única ubicación ETA si no hay despacho; duplicidad sin evidencia → QA. Para no serializados SAP−ETA exige cortes compatibles, no saldos sin fecha. **El resumen inicial no reemplaza ni certifica esa conciliación individual**. Importe Inventario Real/SAP/ETA completos para auditoría serial.
