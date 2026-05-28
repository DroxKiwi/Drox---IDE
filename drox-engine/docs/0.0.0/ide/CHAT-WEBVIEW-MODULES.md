# Chat webview — modules (`droxChat/`)

**Code webview** : `src/vs/workbench/contrib/drox/browser/media/droxChat/`  
**Host workbench (TypeScript)** : `src/vs/workbench/contrib/drox/browser/chat/` (`droxChatController.ts` façade, router, onglets, send, fichiers)  
**CSS** : `droxChatMvp.css` · **chargement** : `DROX_CHAT_SCRIPT_FILES` dans `droxChatWebview.ts`

La doc technique des fichiers reste à côté du code pour faciliter la navigation IDE :

| Fichier doc | Emplacement |
|-------------|-------------|
| [README.md](../../../src/vs/workbench/contrib/drox/browser/media/droxChat/README.md) | À côté des modules `00-context.js` … `11-markdown.js` |

**Regénération** (depuis une sauvegarde monolithique) : `node scripts/split-drox-chat-v2.mjs` à la racine du fork.

**Suivi produit UI** : [UI-PHASE1-CHAT-NATIF.md](./UI-PHASE1-CHAT-NATIF.md) · **intégration workbench** : [../plans/PLAN-INTEGRATION.md](../plans/PLAN-INTEGRATION.md).
