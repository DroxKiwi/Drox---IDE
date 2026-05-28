# Drox chat webview modules

**Suivi projet** : [drox-engine/docs/ide/CHAT-WEBVIEW-MODULES.md](../../../../../../../../drox-engine/docs/ide/CHAT-WEBVIEW-MODULES.md) · [hub doc](../../../../../../../../drox-engine/docs/README.md).

The chat UI is split from `droxChatMvp.js.bak` into ordered modules under `droxChat/`.

| File | Role |
|------|------|
| `00-context.js` | `DroxChat` namespace, DOM refs, state, constants |
| `01-prompt.js` | Prompt textarea helpers, permission modes |
| `01b-models.js` | Sélecteur modèle Ollama (liste `/api/tags`) |
| `02-chrome.js` | Busy state, activity grid, todos |
| `03-composer.js` | Send queue, @ completion, refs, slash commands |
| `04-history.js` | Session history panel, token footer |
| `05-attachments.js` | Images, drag-and-drop |
| `06-userAsk.js` | User-ask card |
| `11-markdown.js` | Rendu markdown CSP-safe (réponses assistant) |
| `07-log.js` | Message log, phases, tools |
| `08-tabs.js` | Session tabs |
| `09-host.js` | `handleHostMessage` (host → webview) |
| `10-bootstrap.js` | Event listeners, `webviewReady` |

**Regenerate:** `node scripts/split-drox-chat-v2.mjs` (source: `droxChatMvp.js.bak`).

**Load order:** `DROX_CHAT_SCRIPT_FILES` in `droxChatWebview.ts`.
