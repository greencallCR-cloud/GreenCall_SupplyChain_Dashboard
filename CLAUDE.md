# CLAUDE.md — GreenCall Supply Chain & Inventory BI

Las reglas permanentes del proyecto están en `AGENTS.md` (fuente única; no duplicarlas aquí):

@AGENTS.md

Este archivo solo añade lo específico de **Claude Code**. Estado del entorno y detalle de
verificación: `docs/CLAUDE_CODE_ENTORNO_CHECKPOINT.md`.

## Identidad y aislamiento
- Proyecto: **GreenCall Supply Chain & Inventory BI** (no usar el nombre "FluidChain").
- Repositorio único: `greencallCR-cloud/GreenCall_SupplyChain_Dashboard`. Base de trabajo: `develop-cloud`.
- El **WMS de GreenCall es otro proyecto**: no leer, modificar ni desplegar su repositorio, ramas,
  base de datos o previews de Vercel (incluido cualquier host `greencallcr-wms-*`), ni reutilizar
  sus sesiones/perfiles de navegador.
- Instalar herramientas solo en `~/.greencall-sc/` (CLIs y venv aislados) o dentro de este repo.
  No modificar `~/.claude/settings.json` ni hooks/plugins de la cuenta.

## Al iniciar una sesión
1. `bash tools/claude-setup/setup.sh` (idempotente, ~20 s desde cero; `--check` solo verifica).
2. `export PATH="$HOME/.greencall-sc/tools/node_modules/.bin:$PATH"` para `gws`, `vercel`, `neonctl`.
3. Python analítico: `~/.greencall-sc/venv/bin/python -I ...` (nunca el Python del sistema).
4. Seguir el orden de lectura de `AGENTS.md` y actualizar `docs/GREENCALL_ESTADO_CONTINUIDAD.md`.

## Mapa de skills en Claude Code (invocar con criterio, no todas)
| Necesidad | Skill / plugin | Alcance |
|---|---|---|
| Proceso (plan, TDD, debug, revisión, verificación) | `superpowers:*` | cuenta |
| Arquitectura, revisión, seguridad, E2E, Postgres, demanda | `ecc:*` (p. ej. `ecc:planner`, `ecc:code-reviewer`, `ecc:security-review`, `ecc:e2e-testing`, `ecc:postgres-patterns`, `ecc:inventory-demand-planning`) | cuenta |
| Sistema de diseño, paletas, tipografía, gráficos | `ui-ux-pro-max:*` | cuenta |
| Dirección visual distintiva | `anthropic-skills:frontend-design` | cuenta |
| Auditoría UI/accesibilidad | `anthropic-skills:web-design-guidelines` | cuenta |
| QA visual real (capturas, responsive, consola) | `anthropic-skills:agent-browser` (CLI `agent-browser`) | cuenta |
| Gráficos y dashboards | `dataviz` + plugin `build-web-data-visualization` (router `data-visualization`) | cuenta / proyecto |
| Neon / SQL | `neon`, `neon-postgres`, `neon-postgres-branches`, `supabase-postgres-best-practices` | proyecto |
| Google Sheets (**solo lectura**) | `gws-shared`, `gws-sheets`, `gws-drive`, `gws-script` (solo inspección) | proyecto |
| Estadística / volumen | `statsmodels`, `polars` | proyecto |
| Vercel (solo Preview) | `deploy-to-vercel` | proyecto |
| Buscar skills nuevas | `find-skills` (`npx skills find <q>`; instalar con `-a claude-code --copy`, sin `-g`) | proyecto |
| Servidores MCP (solo si aportan) | `anthropic-skills:mcp-builder` | cuenta |

No usar `anthropic-skills:google-workspace` en este proyecto: está pensada para **editar** archivos
de Google y aquí Sheets es estrictamente de solo lectura.
