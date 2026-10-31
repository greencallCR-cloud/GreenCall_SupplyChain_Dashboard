# GreenCall Supply Chain & Inventory BI — Visión funcional actualizada
Fecha de consolidación: 2026-10-31. Documento de referencia para Codex; validar todo dato numérico contra el origen y el corte actual.

## AUTONOMÍA Y PRIORIDADES ACTUALES (31/10/2026)
- El usuario autoriza al agente a rediseñar integralmente el frontend y cambiar o refactorizar la arquitectura si pruebas y beneficios lo justifican. No congelar paleta, framework, navegación o estructura de pantallas por inercia. Mantener fidelidad GreenCall/Claro y reglas operativas, no necesariamente la apariencia antigua.
- El agente implementa y valida cambios sin aprobaciones sucesivas por cambios reversibles en código, tests, Preview y bases aisladas. No confundir autorización de desarrollo con autorización para revelar datos, secretos, costos internos o efectuar migraciones destructivas.
- Google Sheets se consulta SOLO en lectura. Excel habitual: tomas físicas. Los costos reales deben investigarse por contexto hasta agotar evidencia; una ausencia verificada se reporta, no se reemplaza por cero.
- El diseño es requisito central: UX/UI Pro Max + Frontend Design + Web Design Guidelines + Agent Browser, con visualizaciones profesionales y prueba responsive real.

## 1. Resultado buscado
Dashboard BI **profesional, íntegro y accionable** para operación GreenCall/Claro CR. Mantener capacidades existentes y mejorar información, ingeniería, estadística, diseño y uso móvil. Debe responder: qué tenemos y dónde, qué se consume, qué se despacha, cuál es el capital por ubicación, qué tiene riesgo o quiebre, qué pedir y cuándo, a quién corresponde cada obligación y qué tan confiables son los datos. Prohibido responder con mocks o métricas sin sustento.

## 2. Fuentes, origen de verdad y frecuencia
Google Sheets principal: `https://docs.google.com/spreadsheets/d/1gUK6b2eLyC2Al5opwiNb1r21-QAYrsJtncS37aP8nj8/edit?usp=sharing`, libro `Copia_Series_General_Green_Call`. Solo lectura y uso de permisos mínimos; leer nombres/encabezados reales antes de mapear.

| Pestaña | Función | Regla |
|---|---|---|
| Consumos | órdenes únicas, unidades consumidas, materiales, histórico, rotación demanda, forecast | ÚNICA fuente principal. No usar ODT. Datos repetidos por orden no implican órdenes nuevas |
| Inventario Real | stock por técnico, bodega, centro, almacén, material, serie, corte | snapshot rector por ubicación; no sumar con SAP/ETA |
| Catálogo SKUs | universo SKU válido, descripción, UDM, contexto de costo | verificar todos los SKUs, valorización completa solo si costo fiable |
| Despachos Serializados / No Serializados | entregas y eventos | unir por acta o técnico+fecha sin acta |
| Rotación Técnicos / Devoluciones Rotación | edad, vencimiento y política | vistas potencialmente solapadas; no duplicar |
| Series SAP / Cantidades SAP | existencia administrativa | cortes separados, material seriado/no seriado |
| Existencias ETA | custodia administrativa y conciliación | no evidencia física |
| Cobros | cartera Cobrado / Justificado / pendiente | no contabilizar potencial como ejecutado |
| Control Devoluciones Taller | devoluciones a taller | no es consumo ni stock automáticamente |
| Tecnicos / Recepciones | códigos, ubicaciones e ingresos | omitir PII personal innecesaria |

El ZIP local completo v1.4.1 documentó **173.761 líneas** en `Consumos` (corte previo). No interpretar ese número como el total hoy sin leer origen. El ZIP de GitHub examinado carecía de `local-data/base.json`; el ZIP local completo sí lo contiene (~86 MB). Mantener la copia offline privada y evaluar replicación derivada en Neon con controles de sincronización; nunca servir JSON crudo vía frontend ni subirlo a repositorio público.

## 3. Importación manual deseada
El usuario quiere que en operación ordinaria **solo se importen archivos Excel de toma física**, con selección de hoja, técnico, fecha, SKU, unidad, cantidades y evidencia. Previsualizar, validar fila por fila, prevenir duplicados, histórico y rollback; resultados físicos pueden sustituir stock calculado donde se especifique, nunca sumarse otra vez. Los antiguos importadores de Excel/CSV de otras fuentes se deben conservar internamente como recurso técnico de recuperación, no como dependencia de actualización cotidiana.

### Conteos físicos y tasa
Para cada técnico/SKU tomar el último registro con campo `Conteo físico` numérico y fecha válida, no simplemente la última fila. Dos tomas comparables permiten estimar:
`consumo_estimado = stock_físico_inicial + despachos_entrantes + reposiciones - devoluciones_salientes - traslados_salientes +/- ajustes_aprobados - stock_físico_final`.
Documentar fechas, inconsistencias y signos. `consumo_estimado/órdenes_únicas_del_técnico_en_intervalo` solo con denominador válido. Sin dos tomas: mostrar proxy de despacho etiquetado, NO consumo confirmado.

## 4. KPIs: matemáticas no negociables
- `órdenes_distintas = |{orden : en Consumos y fecha válida}|`, sin duplicar por línea, material o serie.
- `apariciones(SKU) = |{(orden, SKU)}|` por período, independientemente de cantidad.
- `cantidad_consumida(SKU, UDM) = Σ cantidad válida` solo dentro de SKU y unidad compatible.
- Despachos únicos integrados por **acta contextual** o ausencia de acta `(código técnico canónico, fecha válida)`. Mantener conteo de eventos separado de líneas, series, materiales y cantidades.
- Inventario real por ubicación/centro/almacén/tecnología/SKU y tipo: filtrar todos los técnicos y bodega; capital sin IVA, IVA y con IVA separados; no inventar costos.
- Unidades: cable Drop preconectorizado PZA; UTP exterior M (1M); tensores/majadeos/maja dedos/tape/cinta Dymo/cliper/sensores PZA si catálogo verifica. Nombres alternativos no unen SKUs distintos.
- SKU excluido `7005189` (HAL SIM LTE triple corte) y líneas de mano de obra o conceptos de instalación que no son materiales.
- Cobros: usar `Detalle` (Cobrado, Justificado, sin clasificar); factura y estado acreditados, valores con IVA sin duplicar.
- Política de antigüedad 45 días solo si queda acreditada como vigente; evitar sumar fuentes de rotación solapadas.

## 5. Super ABC y supply chain
ABC valor = cantidad consumida válida × costo verificado, sumada por SKU solo si todas las piezas monetarias se pueden certificar. ABC frecuencia = conteo de apariciones de SKU por órdenes únicas. Pareto acumulado A ~80%, B ~95%, C restante; explicar tratamiento de límite cruzado. Mostrar matriz AA–CC, ranking por demanda y valor, stock inmovilizado vs movimiento, capital por ubicación, cobertura de inventario, exposición a vencimiento y oportunidades de redistribución. SKU sin costo contextual -> `Pendiente costo`, no cero ni etiqueta falsa. Indicar discrepancias exactas para resolverlas y volver a validar tras actualizaciones del catálogo.

## 6. Forecasting: calidad estadística por encima de visuales
**Objetivos separados:** (a) número de órdenes únicas cerradas por tiempo desde `Consumos` Google; (b) demanda histórica por SKU+UDM desde `Consumos`; (c) para consumibles no rebajados/reportados de forma fiable por ETA/SAP, utilizar `Despachos No Serializados` como **proxy de abastecimiento**, o reconstrucción con dos conteos físicos si está acreditada. Jamás mezclar proxy de despacho y consumo confirmado en la misma serie sin marcar el cambio de metodología.

Modelos candidatos según características: naive, seasonal naive, media móvil 3/6, suavizado exponencial, Holt, Holt amortiguado, Holt-Winters aditivo/multiplicativo, Croston, SBA, TSB y otros justificables. Selección individual por SKU/serie según n observaciones, estacionalidad documentada, patrones intermitentes, variabilidad y datos faltantes; modelos sofisticados no siempre ganan. Separa meses parciales, cortes y UDM. Backtesting **cronológico con origen rodante**, sin mirar el futuro, con WAPE, MAE y sMAPE (y medidas adicionales cuando correspondan), comparado contra baselines. Mostrar historial observado, pronóstico 3/6/12 meses, bandas solo respaldadas, modelo elegido, método de evaluación, error observado, fecha y grado de confiabilidad derivado de prueba, nunca inventado.

Planning: stock utilizable por SKU/ubicación, consumo medio, días de cobertura, lead time autorizado/parametrizable, inventario de seguridad justificable, punto de pedido y cantidades con trazabilidad. Si no hay lead time o calidad de demanda suficiente, no emitir un número de pedido supuestamente óptimo.

## 7. Diseño visual y comportamiento esperado
Rediseño profesional con identidad GreenCall + Claro y acento cálido naranja, jerarquía, espacios, tipografía moderna, tarjetas útiles, sin decoraciones superfluas; dashboard auténtico de operaciones, no landing page. Navegación lateral plegable con control estable. Pantallas: Resumen / Resolución Ejecutiva, Inventario Real, Consumos & Órdenes, Despachos Integrados, Rotación, Super ABC, Forecast, Planning Cockpit, Quiebre de Política, Cobros, Taller, Técnicos & Stock, Administración / Salud de fuentes, Toma Física. Se pueden reorganizar, combinar, dividir y rediseñar secciones, incluso reemplazar componentes internos, siempre que las capacidades verificadas se mantengan y pruebas de aceptación lo respalden.

- KPI con definiciones y tooltips; SKU descrito, código en detalle; fuente y fecha de corte en cada vista.
- Filtros globales y locales por período, técnico/código, ubicación, centro, almacén, SKU y tecnología. Paginación y búsqueda con API eficiente.
- Capital por ubicación (evitar denominación Capital inmovilizado por ubicación).
- Diferenciar consumo, apariciones, órdenes y despachos con gráficos no engañosos; cero y desconocido diferentes.
- Colores con contraste accesible; estados reales de sincronización, avisos útiles y vacíos explícitos.
- Responsive con pruebas en desktop, 1366×768, tablet y móvil; tablas con scroll deliberado o diseño compacto, sin overflow accidental. Agent Browser para recorridos reales y capturas de la **versión actual**, no imágenes heredadas.

## 8. Infraestructura sin reconstrucción
GitHub ramas `main` (producción previa) / `develop-cloud` (cloud). Vercel proyecto `greencall-supplychain-dashboard`; publicación previa de interfaz en Production, preview `develop-cloud` con parche API etapa 1. Neon proyecto `greencall-supplychain-bi`, base `greencall_bi`, rama `production` existente; desplegar primero migraciones aditivas en rama de prueba, con integridad, rollback y backups verificados antes de promover a producción. No ejecutar borrados ni migraciones destructivas sin protección y autorización específica.

Patrón objetivo: `Google Sheets read-only -> adaptador + verificación + snapshots de origen -> índices/cachés derivados de lectura para consultas eficientes (Neon si justificado) -> API protegida Vercel -> frontend BI elegido por evidencia (JS/Plotly existente o framework sustituto validado)`. Persistir estado de sincronización y auditoría; cron/worker debe ajustarse a límites reales del plan y duración de lotes. No asumir que `DATABASE_URL` de Production se comparte con Preview. Nunca almacenar secretos en repo. Autenticación y autorizaciones reales antes de exponer datos operativos.

## 9. Umbral de calidad y aceptación
- Todos los módulos responden con datos reales y fechas explicadas, o error explícito si origen incompleto; no números simulados.
- Conservación de líneas históricas, deduplicación, recalculación y discrepancias SAP/ETA verificadas por fixtures.
- Cobertura de SKU/UDM/costo medida; catálogo sin precio: informar contexto concreto, no completar arbitrariamente.
- Pronósticos superan o justifican frente a baselines en backtesting reproducible; métricas reflejan datos reales; modelos sin fuga.
- Importación de toma física es segura, verificable, repetible y reversible.
- API responde y protege los datos; sincronizador idempotente y tolerante a fallos; GitHub no contiene secretos ni datos crudos.
- Benchmarks, pruebas unitarias, integradas, seguridad, HTTP y QA responsive real; evidencia y límites documentados.

La intención del usuario es **resolver todo lo verificable** y lograr calidad productiva, no maquillar datos. Si un origen es inexistente, permiso ausente o costo no hallado, documentar y escalar solo ese bloqueo sin inventar resultados.
