# Checkpoint de preparación — Claude Code · GreenCall Supply Chain & Inventory BI

- Fecha: 2026-11-02 (America/Costa_Rica)
- Modalidad: Claude Code **Cloud** (contenedor efímero), Claude Code 2.1.316, Ubuntu 24.04.5 x86_64
- Rama de trabajo: `claude/sweet-lovelace-dltfpk`, avanzada por fast-forward desde `develop-cloud` (`bc8429c`)
- Alcance: solo preparación del entorno. **Sin cambios de código de la aplicación**, sin despliegues,
  sin escrituras en Google Sheets, Neon ni Vercel. Sin secretos en este documento.

## A. Inventario de herramientas

Persistencia: **Cuenta** = plugin/skill sincronizado por claude.ai en cada sesión nueva ·
**Repo** = archivos versionados en este repositorio · **Script** = lo reinstala `tools/claude-setup/setup.sh`.

| Skill / plugin | Fuente | Versión / revisión | Instalación | Estado | Prueba realizada | Persistencia | Observaciones |
|---|---|---|---|---|---|---|---|
| Superpowers (15 skills) | obra/superpowers vía directorio oficial de Anthropic | 6.4.2 | Plugin de cuenta (preexistente) | Instalada y funcional | Hook SessionStart inyectó `using-superpowers`; skills `brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `systematic-debugging`, `subagent-driven-development`, `dispatching-parallel-agents`, `requesting/receiving-code-review`, `verification-before-completion` listadas | Cuenta | Una sola distribución; no se reinstaló |
| ECC (agentes, skills, hooks) | affaan-m/ECC | 2.2.3 | Plugin de cuenta `ecc` (preexistente) | Instalada y funcional | `claude plugin list` → loaded; agentes `ecc:architect`, `ecc:code-reviewer`, `ecc:security-reviewer`, `ecc:tdd-guide`, `ecc:planner`, `ecc:database-reviewer` disponibles | Cuenta | Hooks del plugin (PreToolUse 10, Stop 8, …) no modificados. Sin instalación manual en `~/.claude` → sin duplicación |
| UI UX Pro Max (7 skills) | nextlevelbuilder/ui-ux-pro-max-skill | 2.15.0 | Plugin de cuenta (preexistente) | Instalada y funcional | `search.py --design-system` (estilo *Data-Dense Dashboard*, paleta, tipografía) y `--domain chart` (series temporales/KPI) | Cuenta | Las sugerencias de color son genéricas: la identidad GreenCall/Claro de `AGENTS.md` prevalece |
| frontend-design | Anthropic | sincronizada 2026-10-22 | Skill de cuenta | Instalada y funcional | Listada como `anthropic-skills:frontend-design` | Cuenta | No duplicada en el repo |
| web-design-guidelines | Vercel (`metadata.author: vercel`) | 1.0.0 | Skill de cuenta | Instalada y funcional | Listada como `anthropic-skills:web-design-guidelines` | Cuenta | No duplicada |
| agent-browser (skill + CLI) | vercel-labs/agent-browser | CLI 0.27.0 | Skill de cuenta + CLI preinstalada en la imagen Cloud | Instalada y funcional | Sesión aislada `greencall-sc-setup`: abrir página pública, árbol de accesibilidad, `eval` DOM, capturas desktop y 390×844, consola/errores; frontend estático del dashboard servido en 127.0.0.1:8899 → 0 errores JS | Cuenta + imagen | Perfil propio; no se reutilizó ningún perfil/sesión del WMS |
| mcp-builder | anthropics/skills | sincronizada 2026-10-28 | Skill de cuenta | Instalada (sin usar) | Listada | Cuenta | No se creó ni conectó ningún servidor MCP |
| dataviz | Anthropic | — | Skill integrada | Instalada | Listada | Cuenta | Guía de color/gráficos |
| find-skills | vercel-labs/skills | hash `913b9d37…` | `npx skills@1.7.4 add … -a claude-code --copy -y` | Instalada y funcional | 20 búsquedas `npx skills find` ejecutadas | Repo (`.claude/skills`, `skills-lock.json`) | |
| deploy-to-vercel | vercel-labs/agent-skills | hash `a024eac4…` | skills CLI, proyecto | Instalada | Presente y verificada por `setup.sh` | Repo | Solo Preview; Production prohibido |
| neon, neon-postgres, neon-postgres-branches | neondatabase/agent-skills | ver `skills-lock.json` | skills CLI, proyecto | Instaladas | Presentes | Repo | Sin acceso a Neon desde aquí |
| supabase-postgres-best-practices | supabase/agent-skills | ver `skills-lock.json` | skills CLI, proyecto | Instalada | Presente | Repo | Solo recomendaciones PostgreSQL; Supabase no se usa como servicio |
| gws-shared, gws-sheets, gws-drive, gws-script | googleworkspace/cli | ver `skills-lock.json` | skills CLI, proyecto | Instaladas | Presentes; `gws auth status` sin credenciales | Repo | Solo lectura. `gws-script` solo para inspección |
| CLI `gws` | npm `@googleworkspace/cli` | 0.22.5 | `npm --prefix ~/.greencall-sc/tools` | Instalada, sin autenticar | `gws --version`, `gws auth status` → `auth_method: none` | Script | No se inició OAuth |
| statsmodels, polars | k-dense-ai/scientific-agent-skills | ver `skills-lock.json` | skills CLI, proyecto | Instaladas y funcionales | `synthetic_forecast_smoke.py` | Repo | Fuente con mayor adopción en skills.sh |
| Entorno Python analítico | PyPI | statsmodels 0.15.0, polars 2.1.0, numpy 2.5.4, scipy 1.18.1, pandas 3.1.0 | `uv venv ~/.greencall-sc/venv` | Instalada y funcional | **Datos sintéticos**: MA, SES, Holt, Holt-Winters, Croston, SBA, TSB, rolling-origin h=3, MAE/WAPE/sMAPE; Polars 175 000 filas (órdenes únicas, apariciones orden+SKU, ABC, sumas por SKU+unidad) en 0,14 s | Script | statsmodels 0.14.5 falló con pandas 3 → se fijó 0.15.0. **No valida datos de GreenCall** |
| build-web-data-visualization (router `data-visualization` + 17 especialistas) | openai/plugins `0722921` | 0.1.21 | Plugin de proyecto desde marketplace local `vendor/claude-plugins` | Instalada, compatibilidad parcial | `claude plugin validate` OK; `claude plugin details` → 18 skills, scope project | Repo (`.claude/settings.json`) | MIT. Su flujo de generación de imágenes de Codex no está disponible. Ver `PROVENANCE.md` |
| build-dashboard, analyze-data-quality, design-kpis | openai/plugins `data-analytics` | 0.2.8 | **No instaladas** | Incompatible / licencia | Inspección de `SKILL.md` y manifiesto | — | Licencia **Proprietary** (no redistribuible en un repo público) y dependientes de ChatGPT Work Mode, Sites, MCP artifact app y conectores `~~structured_data`. Sustitutos: `ecc:dashboard-builder`, `dataviz`, `data-visualization`, `ecc:inventory-demand-planning`, `superpowers:verification-before-completion` |
| CLI `vercel` | npm `vercel` | 65.9.0 | `~/.greencall-sc/tools` | Instalada, sin autenticar | `vercel whoami` → Logged out | Script | |
| CLI `neonctl` | npm `neonctl` | 8.16.0 | `~/.greencall-sc/tools` | Instalada, sin autenticar | `neonctl me` → sin credencial | Script | |
| claude-mem, codex | cuenta | 15.8.1 / 1.0.6 | Plugins de cuenta (preexistentes) | Cargados | `claude plugin list` | Cuenta | No forman parte del alcance; sin cambios |
| `vercel-react-best-practices` | vercel-labs/agent-skills | — | **No instalada** | Innecesaria por ahora | — | — | El frontend es Vanilla JS + Plotly; instalar solo si se decide migrar a React/Next.js |

## B. Entorno
Claude Code 2.1.316 · Node 22.23.4 · npm/npx 10.9.9 · Python 3.13.18 (sistema, sin tocar) · uv 0.11.32 ·
Git 2.43.0 · psql presente · Chromium + Playwright preinstalados · agent-browser 0.27.0 · gws 0.22.5 ·
vercel 65.9.0 · neonctl 8.16.0. Marketplaces: los de la cuenta (anthropic-plugin-directory, ECC,
ui-ux-pro-max-skill, claude-mem, codex-plugin-cc) + `greencall-sc-local` (proyecto). No existe
`~/.claude/settings.json` de usuario y no se creó.

## C. Compatibilidad y persistencia en sesiones nuevas
- **Automático**: plugins y skills de cuenta (sincronizados por claude.ai), skills en `.claude/skills/`,
  plugin local declarado en `.claude/settings.json`, `CLAUDE.md` (que importa `AGENTS.md`).
- **Requiere ejecutar** `bash tools/claude-setup/setup.sh`: CLIs `gws`/`vercel`/`neonctl` y venv Python
  (el contenedor Cloud es efímero; `~/` no persiste). Para que se ejecute solo, añadir al *Setup script*
  del entorno Cloud (menú del entorno en la barra de título → Edit):
  ```bash
  cd GreenCall_SupplyChain_Dashboard && bash tools/claude-setup/setup.sh
  ```
  El setup script del entorno puede ser compartido por otras sesiones: si el WMS usa el mismo entorno,
  crear un entorno Cloud dedicado al Dashboard o dejar este paso manual. No se modificó.
- Reinstalar/actualizar skills de proyecto: `npx skills@1.7.4 experimental_install` (lee `skills-lock.json`)
  o `npx skills update -p`.

## D. Conexiones (conectividad pública ≠ autorización)
| Servicio | Conectividad | Autorización efectiva |
|---|---|---|
| GitHub | `git fetch/push` vía proxy de la sesión; MCP GitHub con alcance a este repo | Sí, rama de trabajo. Repo **público**: no subir datos operativos |
| Google Sheets | API pública accesible | **No**: `gws` sin credenciales. Configurar después: cuenta de servicio con rol *Lector* sobre el Sheet y `GOOGLE_APPLICATION_CREDENTIALS` como secreto del entorno, o `gws auth login` con alcance de solo lectura. Nunca escribir |
| Neon | API pública accesible | **No** (`NEON_API_KEY`/`DATABASE_URL` ausentes). Recomendado: rama Neon de desarrollo y rol de solo lectura como secreto del entorno |
| Vercel | API pública accesible | **No** (`vercel whoami` → Logged out). Solo Preview con `VERCEL_TOKEN` cuando se autorice |

La sesión expone además un host Vercel del **WMS** inyectado por el proxy y una variable
`VERCEL_AUTOMATION_BYPASS_SECRET`: pertenecen al entorno compartido y **no se usaron**.

## E. Independencia del WMS — verificaciones
- Solo se operó sobre `/home/user/GreenCall_SupplyChain_Dashboard` (remote verificado).
- Sin `npm -g`, sin cambios en `/opt/node22/lib/node_modules`, sin cambios en el Python del sistema.
- Sin `~/.claude/settings.json`; plugins/hooks de cuenta sin modificar; marketplace y plugin nuevos con `--scope project`.
- Servidor de prueba solo en 127.0.0.1:8899, detenido por PID al terminar; sesión de navegador propia y cerrada.
- Ninguna llamada al host Vercel del WMS ni a sus recursos.

## F. Estado del dashboard (diagnóstico de solo lectura)
- App Node sin framework (Vanilla JS + Plotly en `public/`, servidor `local-server.mjs`, funciones Vercel en `api/`, `lib/`), única dependencia `@neondatabase/serverless`.
- `npm run check` → OK. `npm run cloud:test` → 6/6. `npm run validate` y `npm start` → **fallan por falta de
  `local-data/base.json`** (histórico privado, correctamente fuera de Git). No se generaron datos sustitutos.
- Frontend estático renderiza (14 módulos de navegación, sin errores JS); los KPIs requieren API/datos.

## G. Cómo iniciar la próxima sesión de desarrollo
1. Crear una sesión Claude Code Cloud sobre `greencallCR-cloud/GreenCall_SupplyChain_Dashboard`, partiendo de
   la rama que contenga este checkpoint (o de `develop-cloud` tras fusionarla).
2. Primer mensaje sugerido:
   > Leé `CLAUDE.md`, `AGENTS.md`, `docs/GREENCALL_ESTADO_CONTINUIDAD.md` y `docs/CLAUDE_CODE_ENTORNO_CHECKPOINT.md`.
   > Ejecutá `bash tools/claude-setup/setup.sh`. Usá `superpowers:brainstorming` y `superpowers:writing-plans`
   > para el primer hito vertical (Sheets solo lectura → KPI → API → UI) y luego desarrollá con TDD.
3. Bloqueos que solo el propietario puede resolver: histórico privado (`base.json`) o credencial de lectura de
   Sheets, credenciales Neon de desarrollo y token Vercel para Preview, como secretos del entorno.
