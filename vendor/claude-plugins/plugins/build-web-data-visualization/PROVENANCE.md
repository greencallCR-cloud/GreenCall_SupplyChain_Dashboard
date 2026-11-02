# Procedencia

- Origen: https://github.com/openai/plugins — `plugins/build-web-data-visualization`
- Revisión: `0722921d5542fc593105c27bd52630babd8b8c2a` (2026-10-08), versión de manifiesto 0.1.21
- Licencia declarada en el manifiesto original (`.codex-plugin/plugin.json`): **MIT**, autor OpenAI.
- Cambios de empaquetado (contenido de skills/references/assets SIN modificar):
  - Se añadió `.claude-plugin/plugin.json` para Claude Code.
  - Se omitieron `.codex-plugin/` y los `agents/openai.yaml` (metadatos de interfaz exclusivos de Codex).
- Compatibilidad con Claude Code: parcial. Las referencias al flujo "concept-first" con
  generación de imágenes de Codex no son ejecutables aquí; usar `frontend-design`,
  `ui-ux-pro-max` y capturas reales con Agent Browser en su lugar.
- No incluido a propósito: `plugins/data-analytics` (build-dashboard, analyze-data-quality,
  design-kpis) — licencia **Proprietary** y dependiente de ChatGPT Work Mode/Sites/MCP artifact app.
