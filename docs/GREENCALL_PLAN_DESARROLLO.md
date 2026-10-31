# Roadmap vivo: GreenCall Supply Chain & Inventory BI — autonomía 2026

### Principio: no un mock, sino cortes verticales verificables
El objetivo final puede requerir varias sesiones, pero **cada sesión debe desarrollar, probar, registrar y subir cambios útiles**, no solamente enumerar propuestas. Se permite reordenar etapas según evidencia encontrada.

| Hito | Resultado demostrable | Tests / puertas de salida |
|---|---|---|
| 0. Baseline y seguridad | ramas remotas, acceso/visibilidad, frontend Vercel, API Preview, endpoint status; secretos y datos privados seguros | npm check/validate/cloud:test; HTTP y estado real de Preview; sin exponer PII |
| 1. Diseño del producto | design system moderno consistente, IA de navegación, jerarquía, accesibilidad, layout responsive y componentes reutilizables | Agent Browser desktop/tablet/móvil; antes/después; consola sin errores |
| 2. Fuente→cálculo→API→pantalla | lectura `Consumos` real read-only autorizada; incremental/snapshot validado; endpoint que responde; una vista de KPIs reales | idempotencia, filas, fechas, órdenes y apariciones, HTTP, auth |
| 3. Fuentes e inventarios | Inventario Real, catálogo contextual, despachos únicos, SAP/ETA/cobros/taller y costos | reconciliación y cortes, cero vs desconocido, IVA 13%, SQL validado |
| 4. Tomas físicas Excel | importer Excel con preview/validaciones/auditoría, última toma válida e intervalos | 2 conteos, reversión, anomalías, cantidad por unidad |
| 5. Forecast y planning | selección automática por serie con backtest cronológico, gráfico de bandas si evidenciado, órdenes+SKU+proxy | baseline vs modelos, WAPE/MAE/sMAPE, leakage, horizonte |
| 6. Super ABC y rotación | valor/frecuencia por matriz y riesgo por técnico/ubicación; capital, vigencia | pares orden-SKU, contextual costs, cortes |
| 7. Experiencia completa | filtros, drilldowns, tooltips, ordenamiento, exportaciones seguras, densidad, dispositivos | journeys de usuario y responsive real, no imágenes viejas |
| 8. Rendimiento/seguridad/operación | caching, paginación, incremental sync, login/roles, observabilidad, backups | carga real 170k+, p95 endpoints, XSS/CSRF, rollback |
| 9. Entrega final | Preview/prod cuando seguros, documentación de despliegue, backup ZIP y local | matriz 100% evidenciable o fallos verificables explícitos |

## Focos de análisis por cada indicador
- Origen único certificado y corte temporal comparable.
- Filtro técnico, bodega, centro, almacén, SKU, tipo, fecha.
- Denominador correcto: órdenes ≠ filas ≠ apariciones ≠ despachos ≠ series.
- Unidades y costos por contexto, sin suposiciones ni mezclas.
- Proveniencia, rango de confianza y huecos de calidad visibles.
- Integración con acciones de abastecimiento, rotación, conciliación y cobros.

## Estado inicial antes de primera tarea
`develop-cloud` contiene un Cloud Stage1, Vercel Preview Ready mostrado por usuario; PROD frontend se renderiza pero `/api/status` era 404. Neon DB `greencall_bi` creada por usuario y DATABASE_URL configurada solo en Vercel Production; no se ha verificado Preview ni esquema SQL. `local-data/base.json` no está en ZIP de GitHub, pero sí en ZIP local privado v1.4.1. El repositorio fue reportado PUBLIC: comprobar estado actual antes de incorporar documento o data operativa.
