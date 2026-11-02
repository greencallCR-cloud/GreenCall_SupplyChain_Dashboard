#!/usr/bin/env bash
# Preparación idempotente del entorno Claude Code para GreenCall Supply Chain & Inventory BI.
# - Instala CLIs (gws, vercel, neonctl) en ~/.greencall-sc/tools (prefijo aislado, sin -g).
# - Crea ~/.greencall-sc/venv con las librerías estadísticas fijadas.
# - Verifica que las skills del proyecto estén presentes.
# NO toca: configuración global de Claude Code, otros repositorios (WMS), Google Sheets,
# Neon ni Vercel. No pide credenciales ni inicia flujos OAuth.
# Uso: bash tools/claude-setup/setup.sh [--check]   (--check = solo verificar, no instalar)
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE="${GREENCALL_SC_HOME:-$HOME/.greencall-sc}"
TOOLS="$BASE/tools"; VENV="$BASE/venv"; BIN="$TOOLS/node_modules/.bin"
CHECK_ONLY=0; [[ "${1:-}" == "--check" ]] && CHECK_ONLY=1
CLI_PKGS=("@googleworkspace/cli@0.22.5" "vercel@65.9.0" "neonctl@8.16.0")
fail=0; ok(){ echo "  [OK]  $*"; }; ko(){ echo "  [FALTA] $*"; fail=1; }

echo "== GreenCall SC · preparación de entorno (repo: $REPO)"
if [[ $CHECK_ONLY -eq 0 ]]; then
  mkdir -p "$TOOLS"
  if [[ ! -x "$BIN/gws" || ! -x "$BIN/vercel" || ! -x "$BIN/neonctl" ]]; then
    npm install --no-fund --no-audit --prefix "$TOOLS" "${CLI_PKGS[@]}" >/dev/null
  fi
  if [[ ! -x "$VENV/bin/python" ]]; then
    if command -v uv >/dev/null; then uv venv -q --python 3.13 "$VENV" || uv venv -q "$VENV"; else python3 -m venv "$VENV"; fi
  fi
  if command -v uv >/dev/null; then
    uv pip install -q --python "$VENV/bin/python" -r "$REPO/tools/claude-setup/requirements-analytics.txt"
  else
    "$VENV/bin/pip" install -q -r "$REPO/tools/claude-setup/requirements-analytics.txt"
  fi
  # Dependencia declarada de la app (node_modules está en .gitignore). Sin lockfile en el repo.
  (cd "$REPO" && npm install --no-package-lock --no-fund --no-audit >/dev/null)
fi

echo "== Herramientas"
for b in gws vercel neonctl; do [[ -x "$BIN/$b" ]] && ok "$b $("$BIN/$b" --version 2>/dev/null | head -1)" || ko "$b"; done
command -v agent-browser >/dev/null && ok "agent-browser $(agent-browser --version)" || ko "agent-browser (preinstalado en Claude Code Cloud)"
if [[ -x "$VENV/bin/python" ]] && "$VENV/bin/python" -I -c "import statsmodels,polars,numpy,scipy,pandas" 2>/dev/null; then
  ok "venv $("$VENV/bin/python" -I -c 'import statsmodels,polars;print("statsmodels",statsmodels.__version__,"polars",polars.__version__)')"
else ko "venv analítico ($VENV)"; fi

echo "== Skills de proyecto (.claude/skills)"
for s in find-skills deploy-to-vercel neon neon-postgres neon-postgres-branches supabase-postgres-best-practices \
         gws-shared gws-sheets gws-drive gws-script statsmodels polars; do
  [[ -f "$REPO/.claude/skills/$s/SKILL.md" ]] && ok "$s" || ko "$s"
done
[[ -f "$REPO/vendor/claude-plugins/.claude-plugin/marketplace.json" ]] && ok "marketplace local greencall-sc-local" || ko "marketplace local"

echo "== Autenticación (solo estado; no se inicia ningún login)"
"$BIN/gws" auth status 2>/dev/null | grep -E '"auth_method"' | sed 's/^/  gws: /' || true
echo "  neon: $([[ -n "${NEON_API_KEY:-}" ]] && echo 'NEON_API_KEY presente' || echo 'sin NEON_API_KEY')"
echo "  vercel: $([[ -n "${VERCEL_TOKEN:-}" ]] && echo 'VERCEL_TOKEN presente' || echo 'sin VERCEL_TOKEN')"
echo "  postgres: $([[ -n "${DATABASE_URL:-}" ]] && echo 'DATABASE_URL presente' || echo 'sin DATABASE_URL')"
echo "PATH sugerido: export PATH=\"$BIN:\$PATH\""
[[ $fail -eq 0 ]] && echo "RESULTADO: entorno listo" || { echo "RESULTADO: faltan componentes"; exit 1; }
