# Drox chat webview modules

**Suivi projet** : [docs/ide/CHAT-WEBVIEW-MODULES.md](../../../../../../../../docs/ide/CHAT-WEBVIEW-MODULES.md) · **Découpage 1.3.2** : [docs/1.3/1.3.2/DECOUPAGE-CHAT-WEBVIEW.md](../../../../../../../../docs/1.3/1.3.2/DECOUPAGE-CHAT-WEBVIEW.md)

Modules ordonnés par mécanique, chargés via `DROX_CHAT_SCRIPT_FILES` dans `droxChatWebview.ts`.

## Arborescence racine

| Dossier | Mécanique |
|---------|-----------|
| `core/` | `00-bootstrap.js`, `dom.js`, `constants-modes.js`, `state.js`, `warmup-phrases.js`, `constants-meta.js` |
| `settings/` | Prompt, modèles (`role-models/`), réglages (`general-settings/`) |
| `chrome/` | `util`, `composer-chrome`, `busy`, `activity`, `todos`, … |
| `composer/` | `pending`, `refs`, `path-complete`, `send`, … (+ `03b-userPromptSticky.js`) |
| `session/` | Historique, onglets |
| `attachments/` | Fichiers / images |
| `user-ask/` | Carte user-ask |
| `stream/` | Fil de messages (voir ci-dessous) |
| `markdown/` | Rendu markdown |
| `tools/` | Tray outils, file changes |
| `bridge/` | `tool-events`, `host-message`, `10-bootstrap` |

## `stream/` (ex-`07-log.js`)

| Sous-dossier | Fichiers |
|--------------|----------|
| `log/` | `00-constants.js` — `D.streamLog` (phases, marqueurs) |
| `discussion/` | `state.js` |
| `answer/` | `helpers.js`, `presentation.js`, `stream.js` |
| `messages/` | `viewer.js`, `scroll.js`, `user.js`, `orchestration.js` |
| `tools/` | `logTools.js` — blocs outil dans le fil |
| `timeline/` | `strip.js`, `chronology.js`, `thinking.js`, `phases.js`, `mount.js`, `overrides.js` — fil chronologique TUI (**overrides en dernier**) |

Routage texte : `display/simple.js` (`appendDelta` → `routeSimpleDisplayDelta`). Solo architecte — pas de modules executor/subagent/segment (1.4.0 Phase 2d).

## Regénération

- `node scripts/split-00-context.mjs` · `split-01c-role-models.mjs` · `split-03-composer.mjs` · `split-02-chrome.mjs` · `split-09-host.mjs` · `split-01d-general-settings.mjs` (sources monolithiques supprimées après run)
- `node scripts/split-drox-chat-v2.mjs` → `droxChat/_legacy-flat/` (ne pas écraser la structure actuelle)
