# Catálogo de Skills de Codex y modo de uso
**Origen:** registro de preparación/install de Codex Cloud adjuntado por el usuario (sesión hasta 31/10/2026). Este documento **no certifica** que las skills estén montadas en cada ejecución futura: comprobarlo al iniciar.

## Verificado por la sesión de instalación relatada
Después de publicar el entorno, la sesión reportó 26 entradas globales para Codex, sin duplicación, más Superpowers como plugin remoto activo (15 Skills). Reportó instalación adicional de 10: `neon`, `neon-postgres`, `supabase-postgres-best-practices`, `deploy-to-vercel`, `build-dashboard`, `analyze-data-quality`, `design-kpis`, `data-visualization`, `statsmodels`, `polars`. Preexistentes: `gws-shared`, `gws-sheets`, `gws-drive`, `gws-script`, `gws` CLI 0.22.5, Find Skills, Web Design Guidelines, UI UX Pro Max + complementarias, Agent Browser, Frontend Design, MCP Builder. No consta acceso OAuth autenticado al Sheet privado ni conexión Neon/Vercel desde esa sesión. La práctica de prueba `polars` con 175.000 filas fue sintética, NO validación de GreenCall.

## Orquestación por etapa (usar la skill correspondiente, no todas en cada cambio)
| Tarea | Skills prioritarias | Evidencia exigida |
|---|---|---|
| Planificación del trabajo | Superpowers: brainstorming, writing-plans, worktree isolation si existe | plan incremental, riesgo, criterios de aceptación |
| Depuración y TDD | Superpowers: systematic-debugging, test-driven-development, verification-before-completion, code-review si están disponibles | tests rojos primero, verdes al final, diff explicado |
| KPIs y reglas de negocio | design-kpis, analyze-data-quality, build-dashboard | definiciones SQL/JS y fixtures reproducibles |
| Estadística y pronósticos | statsmodels, polars, analyze-data-quality | backtesting temporal, métricas reales, integridad de fechas |
| Diseño de interfaz | UI UX Pro Max, Frontend Design, Web Design Guidelines, data-visualization | prototipo coherente, accesibilidad y visualización no engañosa |
| QA visual | Agent Browser | navegación, capturas desktop/móvil reales, sin errores de consola |
| Google Sheets | gws-shared, gws-sheets, gws-drive; gws-script solo para inspección autorizada | comprobar OAuth y permisos, usar lectura estricta |
| Neon y SQL | neon, neon-postgres, supabase-postgres-best-practices (solo recomendaciones PostgreSQL) | migraciones revisadas, tests de consulta, plan de reversión |
| Vercel | deploy-to-vercel | Preview Ready, tests HTTP y seguridad previos a Production |
| Buscar habilidades nuevas | Find Skills | origen oficial, compatibilidad, sin instalar redundancias |
| MCP especializado | MCP Builder, solo si aporta capacidad imposible con conectores existentes | diseño de permisos y pruebas read-only; autonomía para prototipo aislado; permisos explícitos si implica exponer servicios o datos |

No forzar `vercel-react-best-practices`: el repositorio parte de Vanilla JS y Plotly, no React ni Next.js; si se decide migrar justificadamente a React/Next.js, activar las skills específicas y verificar paridad funcional. ECC y otras tools citadas previamente solo se consideran disponibles después de verificar su instalación en la instancia actual.

## Autonomía de elección tecnológica
Se autoriza introducir tecnologías, frameworks, servicios, componentes, librerías y automatizaciones adicionales cuando mejoren de forma comprobable mantenibilidad, seguridad, rendimiento, estadística o UX. Evaluar costo, dependencia, despliegue, plan de migración y reversión. Evitar instalar recursos por moda. Las skills guían buenas prácticas, no determinan el framework por decreto.

## Uso por sesión
1. Al comenzar: inspeccionar skill manifests y comandos realmente disponibles; indicar las pertinentes para la tarea.
2. Aplicar la metodología de Superpowers y skills especializadas según subtarea.
3. Conservar registros de pruebas y decisiones técnicas; no declarar trabajo hecho por una skill sin ejecutarla.
4. El Install script y Start skill existentes en el entorno Codex Cloud se preservan; no reinstalar a ciegas ni duplicar scripts en el repositorio.
5. Trabajar hasta completar subtareas verificables y escribir checkpoint antes de terminar la sesión.
