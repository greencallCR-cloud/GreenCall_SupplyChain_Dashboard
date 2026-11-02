# ESTADO VIVO Y CHECKPOINT — GreenCall Codex

> Este documento SE DEBE ACTUALIZAR EN CADA HITO VERIFICADO y commitear. En nueva tarea, se lee junto con AGENTS.md. No escribir secretos ni datos personales.

## Baseline de arranque (31/10/2026)
- Repo: `greencallCR-cloud/GreenCall_SupplyChain_Dashboard`; en último chequeo conocido GitHub declaró `visibility: public`; confirmar de nuevo.
- Código de trabajo: `develop-cloud`, con Cloud Stage1. Rama nueva recomendada `codex/greencall-v2` **desde develop-cloud**; no resetear ni borrar rama antigua.
- App Production: frontend estático se visualizaba, `/api/status` daba 404; API en `develop-cloud` Preview Ready pero falta validar JSON en vivo.
- Neon: proyecto `greencall-supplychain-bi`, base `greencall_bi`, branch `production`; el usuario verificó `SELECT current_database()`; en Vercel se guardó `DATABASE_URL` para Production, no confirma acceso de Preview.
- Sheets maestro: ID `1gUK6b2eLyC2Al5opwiNb1r21-QAYrsJtncS37aP8nj8`. Metadatos anteriores: 38 tabs, `Consumos` 173762 filas de cuadrícula incl. encabezado. El snapshot local original documenta 173761 líneas históricas. Los números son cortes previos, no estado vivo actual.
- Codex Cloud: entorno publicado por el usuario, sesión de instalación indicó 26 skills globales + Superpowers remoto; nueva tarea debe revalidar disponibilidad y autorización efectiva Google/Neon.
- Al arranque no se han aplicado cambios productivos por este kit. Los archivos de este kit están fuera del repo hasta ser incorporados.

## Checkpoint de la nueva tarea — EL AGENTE COMPLETA
- Fecha/hora zona America/Costa_Rica:
- Entorno / rama / Git HEAD:
- Objetivo de hito:
- Estado anterior confirmado (qué se leyó/probó):
- Archivos cambiados + hashes si aportan:
- Skills realmente ejecutadas (no solo detectadas):
- Datos externos y corte contrastado:
- Tests ejecutados (comandos, resultados):
- Pruebas visuales (URL, tamaños, capturas):
- API/deploy/Neon/Sheets (factual, no suposiciones):
- Decisiones y justificación:
- Bloqueos específicos (si los hay):
- Próxima acción **ejecutable** con comando/ruta precisa:
- Último commit/push/PR:

## Hito 2026-11-02 — Preparación de Claude Code (sin cambios de aplicación)
- Rama `claude/sweet-lovelace-dltfpk` (fast-forward desde `develop-cloud` `bc8429c`).
- Skills de proyecto en `.claude/skills/` (+ `skills-lock.json`), plugin local `build-web-data-visualization`, `CLAUDE.md`, `tools/claude-setup/`.
- Detalle, pruebas, persistencia y bloqueos: `docs/CLAUDE_CODE_ENTORNO_CHECKPOINT.md`.
- Tests: `npm run check` OK; `npm run cloud:test` 6/6; `validate`/`start` bloqueados por falta de `local-data/base.json` (privado).
- Próxima acción: nueva sesión → `bash tools/claude-setup/setup.sh` → primer hito vertical según `AGENTS.md`.

## Recuperación después de límite/cuota o nueva conversación
1. Reabrir este repositorio/entorno Codex publicado.
2. Leer `AGENTS.md` y este checkpoint, mirar SHA real y git status/diff.
3. Continuar el siguiente hito pendiente: NO repetir instalaciones ni devolver un informe largo en vez de programar.
4. Hacer commits incrementales y checkpoint antes de finalizar cada iteración.

**Importante:** Guardar contexto no crea una reactivación automática de Codex al recuperar cuota. Los cambios sin commit pueden no existir en una nueva tarea aislada.
