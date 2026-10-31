# AGENTS.md — AUTONOMÍA OPERATIVA GREENCALL SUPPLY CHAIN & INVENTORY BI

## Mandato y alcance (autorización general del propietario, 31/10/2026)
El usuario autoriza al agente a **desarrollar autónomamente de principio a fin** sobre el repo existente `greencallCR-cloud/GreenCall_SupplyChain_Dashboard`: inspeccionar, rediseñar, reestructurar, sustituir módulos, refactorizar, añadir o retirar dependencias justificadas, programar, probar, crear migraciones, documentar, hacer commits/push en rama de trabajo y publicar **previews**. No pedir aprobación por cada pantalla, cambio de diseño, modelo estadístico, endpoint, refactorización o decisión técnica reversible. Identificar el mejor diseño profesional e implementarlo; no quedarse en análisis o bocetos.

**Guardarraíles no negociables:** no exponer datos internos o PII, credenciales, costos o inventarios privados en Git/public, URLs públicas, logs ni capturas; no cambiar facturación/plan/roles/permisos públicos a ciegas; no borrar datos o históricos, realizar migraciones destructivas ni editar fuentes operativas sin mecanismos de respaldo, permisos adecuados y pruebas. Google Sheets tiene permiso **solo lectura** de origen (no escribir hojas, Apps Script ni valores). Un secreto o aprobación externa que solo el propietario pueda otorgar es un bloqueo explícito, no una excusa para detener el resto del desarrollo.

Trabaja por defecto en una **rama nueva de trabajo** creada desde `develop-cloud`, por ejemplo `codex/greencall-v2`, siempre verificando primero Git HEAD, diff y ramas remotas. No reiniciar desde `main`, no descartar el parche Cloud Stage1 y no borrar `develop-cloud`. Cada tarea debe hacer cambios verificables. Podés hacer commits y push de tu rama y desplegar Preview. La promoción reversible a producción solo procede cuando estén verificados seguridad/autenticación, datos reales, pruebas, plan de rollback y permisos del entorno; si no, continúa sin publicar producción. Nunca reemplazar valores desconocidos por números simulados.

## Orden de lectura obligatorio al comenzar o retomar
1. Este AGENTS.md y `docs/GREENCALL_ESTADO_CONTINUIDAD.md`.
2. `docs/GREENCALL_VISION_FUNCIONAL.md`, `docs/GREENCALL_AUTONOMIA_Y_CALIDAD.md`, `docs/GREENCALL_SKILLS_Y_FLUJO.md`, `docs/GREENCALL_MATRIZ_ACEPTACION.md`.
3. `docs/GREENCALL_PLAN_DESARROLLO.md`, `docs/PROMPT_MAESTRO_v1.4_REFERENCIA.md`, código real y scripts QA.
4. `git status -sb`, `git log -5 --oneline --decorate`, tree, tests, configuración de Preview. Reconciliar doc con hechos; código/datos reales prevalecen sobre recuerdos antiguos.

## Fuentes y reglas esenciales de Supply Chain
- Google Sheets maestro, sólo lectura: `https://docs.google.com/spreadsheets/d/1gUK6b2eLyC2Al5opwiNb1r21-QAYrsJtncS37aP8nj8/edit?usp=sharing`. Validar nombres de pestañas y cabeceras reales. `Consumos` es la fuente única principal de órdenes cerradas, consumo sistémico y forecast de órdenes/SKU; no sustituir por ODT. `Inventario Real` es el snapshot rector de stock por ubicación; `Catálogo SKUs` fija universo válido, unidades y costo según contexto. SAP/ETA son evidencias administrativas con cortes; ETA no prueba existencia física.
- `ordenes = COUNT DISTINCT orden` con fecha válida. `apariciones = COUNT DISTINCT (orden, SKU)`. Cantidades por SKU y unidad: M, PZA, ML no se suman entre sí. SKU de exclusión `7005189`, mano de obra y servicios quedan fuera de métricas de materiales.
- Despacho único por acta contextual o, sin acta, por técnico + fecha; fusionar serializados/no serializados del mismo evento, sin confundir líneas con eventos.
- Serie real: vigente SAP, no consumida/devuelta sin reingreso/cobrada; último despacho válido define custodio, ETA inequívoca sólo en ausencia de despacho. Falta de evidencia = diferencia explícita, jamás custodio inventado.
- Toma física en Excel es la **única carga manual habitual**. Último conteo válido por técnico+SKU; entre dos conteos se puede reconstruir consumo físico estimado (stock inicial + entradas - salidas - final), con conciliación y contexto. Despachos no serializados sólo proxy cuando no existe consumo validado; conservar importadores legacy como recuperación administrativa.
- Costos: resolver todas las combinaciones que permitan los datos `SKU+centro+almacén+lote`; CRC sin IVA, IVA 13% una vez, con IVA. Buscar costo real cuando falte, nunca imputar 0 ni precio de otra ubicación arbitrariamente. Si hay falta irreconciliable, estado `NO_VERIFICABLE` con evidencia y efecto del KPI; no fabricar perfección.
- Forecast por serie/corte/unidad: baselines, moving average, ETS/Holt, Holt-Winters cuando aplique, Croston/SBA/TSB para demanda intermitente, etc.; comparación automática por backtesting cronológico sin fuga, MAE/WAPE/sMAPE, incertidumbre respaldada, horizontes 3/6/12, meses parciales separados. Optimización de stock/lead time solo con datos suficientes.

## Diseño: libertad máxima y exigencia máxima
El objetivo es una **experiencia BI moderna, extremadamente profesional y operativa**, para desktop, laptop, tablet y móvil: diseño distintivo cálido GreenCall/Claro, grilla, navegación excelente, jerarquía, gráficos adecuados, información accionable, filtros globales y cruzados, drilldowns, tablas grandes rápidas, cobertura y corte visibles, accesibilidad WCAG razonable. Se autoriza rediseñar **todas** las páginas, estructura visual y arquitectura frontend. Puede considerarse React/Vue/Next o mantenerse JS/Plotly: elegir por evidencia; no por existencia de una skill. Debe funcionar en Vercel y con base offline local cuando aplique. Antes/después con capturas reales Agent Browser, sin mocks como sustituto de fuente.

Pantallas/funciones que no pueden perderse: resumen ejecutivo, inventario real y capital por ubicación, consumos y órdenes, despachos integrados, rotación, quiebre de política, Super ABC, forecasting y planning, cobros, taller, técnicos/stock, toma física y administración/salud de origen. Se permite reagrupación/rebranding, pero no desaparición funcional sin reemplazo comprobable.

## Uso efectivo de skills del entorno Codex publicado
Verificar las manifests antes de invocar. Se reportaron 26 skills Codex y Superpowers remoto; pueden variar por nueva tarea.
- Superpowers: planificación, TDD, depuración sistemática, revisiones y verificación de finalización.
- UI UX Pro Max, Frontend Design, Web Design Guidelines, Agent Browser: diseño, frontend, usabilidad, pruebas visuales/responsive reales.
- build-dashboard, design-kpis, analyze-data-quality, data-visualization: modelo BI, control de calidad, semántica de KPIs, gráficos.
- statsmodels y polars: EDA, backtesting, modelos y volumen; no implicar Python en producción sin arquitectura validada.
- neon, neon-postgres, supabase-postgres-best-practices: persistencia y SQL seguro.
- deploy-to-vercel: funciones serverless, Preview, despliegues verificables.
- gws-shared/gws-sheets/gws-drive/gws-script: consultas autorizadas a Google, **sólo lectura**.
- Find Skills para capacidades faltantes; MCP Builder únicamente si realmente aporta un servidor independiente. No ejecutar indiscriminadamente todas: usar con criterio y documentar evidencia de uso.

## Ciclo de ejecución obligatorio (NO detenerse solo en diagnóstico)
1. Validar repositorio, acceso, baseline y riesgos. Si el repo es PUBLIC, NO publicar históricos, secretos ni documentación interna; continuar sobre fuentes sintéticas hasta resolver privacidad/permisos de manera segura. Informar bloqueo preciso.
2. Construir y mantener matriz `requisito -> origen -> lógica -> API -> UI -> prueba -> estado`, con corte y cobertura.
3. Priorizar una ruta vertical real completa desde Sheets read-only (o snapshot privado validado) hasta KPI/API/UI; conectar Neon cuando facilite persistencia/caché/índices, con idempotencia, migraciones aditivas y backup.
4. Mejorar diseño en paralelo con calidad de datos: design system, layouts, visualizaciones y responsive, integrando módulos por iteraciones útiles.
5. Fortalecer forecast, tomas físicas, Super ABC, stock, costos y planning con QA estadístico reproducible.
6. Ejecutar los scripts disponibles de test, pruebas HTTP, regresión, seguridad, rendimiento y navegador; validar sobre datos reales cuando haya autorización. Documentar lo no verificado.
7. Commit/push de cambios probados en rama de trabajo. Preview con comprobación real de HTTP y seguridad. Continuar al siguiente hito autónomamente mientras se disponga de capacidad.

## Memoria duradera / política ante agotamiento de contexto
`docs/GREENCALL_ESTADO_CONTINUIDAD.md` es el checkpoint vivo. ACTUALIZAR al final de cada hito y antes de terminar: fecha, rama, SHA, modificaciones, skills realmente usadas, evidencia test, cobertura, fuentes/cortes, decisiones, limitaciones, próxima acción precisa y comandos. Escribirlo en Git mediante commits regulares. Si se acaba el contexto, un nuevo chat lee repo + checkpoint y continúa. **No prometer autorreanudación cuando se restablezca el límite**: la plataforma puede requerir una nueva tarea o un disparador configurado. No olvidar commits: una tarea nueva no hereda necesariamente cambios no confirmados de otra.

## Estilo de colaboración
Autonomía por defecto; sin preguntas rutinarias, sin entregas exclusivas de propuestas, sin métricas inventadas. Si falta credencial o autorización personal, continuar trabajo independiente y dejar instrucciones mínimas y exactas para desbloquearla. Al informar, resumir resultados efectivos, pruebas y siguiente objetivo.
