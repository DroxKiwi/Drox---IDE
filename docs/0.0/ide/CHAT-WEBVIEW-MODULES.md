# Chat webview — modules (`droxChat/`)

**Code webview** : `src/vs/workbench/contrib/drox/browser/media/droxChat/` (sous-dossiers par mécanique)  
**Host workbench (TypeScript)** : `src/vs/workbench/contrib/drox/browser/chat/` (`droxChatController.ts` façade, router, onglets, send, fichiers)  
**CSS** : `droxChatMvp.css` · **chargement** : `DROX_CHAT_SCRIPT_FILES` dans `droxChatWebview.ts`

| Dossier | Rôle |
|---------|------|
| `core/` | bootstrap, dom, state, constants, warmup-phrases |
| `settings/` | Prompt, modèles, réglages |
| `chrome/` | Busy, activité, todos |
| `composer/` | Saisie, envoi, sticky |
| `session/` | Historique, onglets |
| `attachments/` | Fichiers / images |
| `user-ask/` | Carte user-ask |
| `stream/` | Fil (`log/*`, `timeline/*`) |
| `markdown/` | Rendu markdown |
| `tools/` | Tray outils, file changes |
| `bridge/` | Host messages, bootstrap |

| Fichier doc | Emplacement |
|-------------|-------------|
| [README.md](../../../src/vs/workbench/contrib/drox/browser/media/droxChat/README.md) | Arborescence + ordre de chargement |

**Regénération** (depuis une sauvegarde monolithique) : `node scripts/split-drox-chat-v2.mjs` à la racine du fork.

**Suivi produit UI** : [UI-PHASE1-CHAT-NATIF.md](./UI-PHASE1-CHAT-NATIF.md) · **intégration workbench** : [../plans/PLAN-INTEGRATION.md](../plans/PLAN-INTEGRATION.md).
