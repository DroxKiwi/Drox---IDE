# Extension VS Code « Drox » (référence)

> **Production KDDS Nexus** : l’UI agent est dans le fork (`src/vs/workbench/contrib/drox/`).  
> Utilisez **[`../../DROX.md`](../../DROX.md)** pour développer sur Nexus. Cette extension sert de **référence de parité** et de tests F5 isolés.

Client VS Code pour le moteur **Drox** : spawn `drox --serve`, JSON-RPC NDJSON
sur stdio, webview de chat avec streaming `text_delta`, exécution **hybride**
des tools (`file_write`, `file_edit`, `bash` côté VS Code ; le reste côté Rust)
depuis la phase 2.2.

## Prérequis

- **Node.js 18+** (pour `npm` / TypeScript).
- **Rust toolchain** (`cargo`) pour construire `drox-cli`.
- Un serveur LLM compatible Ollama joignable (`http://localhost:11434` par
  défaut). Tu peux configurer URL / modèle / API key dans
  `drox/.drox/.env` (voir `drox/.drox/env.example`).

Le binaire `drox` est cherché dans cet ordre (configurable via le réglage
`drox.executablePath`) :

1. `drox.executablePath` (si renseigné) ;
2. `<workspace>/drox/target/debug/drox(.exe)` ;
3. `<workspace>/target/debug/drox(.exe)` ;
4. `<workspace>/../drox/target/debug/drox(.exe)` ;
5. `drox` sur le `PATH`.

## Tester depuis VS Code (F5)

```bash
cd extension-vscode
npm install
```

1. Ouvre **le dossier `extension-vscode/`** dans VS Code
   (Fichier → Ouvrir le dossier…).
2. Appuie sur **F5** (ou Run → Start Debugging).
   - La build par défaut enchaîne **`npm: compile`** puis
     **`cargo: drox-cli (debug)`** (cf. `.vscode/tasks.json`).
   - Une fenêtre « **[Extension Development Host]** » s'ouvre.
3. Dans la fenêtre Extension Host : **Fichier → Ouvrir le dossier…** →
   choisis le **dossier racine du repo** (`claude-code-leak-packaged/`) pour
   que l'auto-détection trouve `drox/target/debug/drox.exe`.
4. **`Ctrl+Shift+P`** → **« Drox: Ouvrir le chat »**.
5. Tape un message et **Envoyer**.

## Ce que tu vas voir

- **Le chat** :
  - tes messages préfixés par `▸ ` ;
  - le texte de l'assistant en streaming ;
  - chaque appel d'outil dans un bloc repliable
    `▸ tool: <nom> (<id>)` puis `◂ résultat (<id>)` ;
  - les éventuels snippings de contexte en ligne grise.
- Quand l'agent appelle **`file_write`** ou **`file_edit`** : une vue
  **diff** s'ouvre, puis une **boîte modale** te demande
  *Appliquer* / *Abandonner*.
- Quand il appelle **`bash`** : la commande tourne via `child_process` ; le
  flux est mirroré dans **Sortie → « Drox (bash) »** pour visibilité directe.
- Les logs stderr du moteur Rust sont dans **Sortie → « Drox (moteur) »**.

## Réglage rapide LLM

Crée un fichier `drox/.drox/.env` (gitignored) à partir de
`drox/.drox/env.example` :

```env
DROX_SERVER=http://localhost:11434
DROX_MODEL=llama3.2
# DROX_API_KEY=sk-xxx  # facultatif (header x-api-key)
```

Tout flag CLI / variable d'environnement shell prime sur le `.env`.

## Dépannage

| Symptôme | Vérifier |
|---|---|
| « Drox: spawn failed » au démarrage du chat | Le binaire n'est pas trouvé. Soit `cargo build -p drox-cli` n'a pas tourné, soit le workspace ouvert dans l'Extension Host ne contient pas `drox/target/debug/…`. Force le chemin via la setting `drox.executablePath`. |
| Aucun message ne s'affiche | Le moteur log sur stderr → ouvre **Sortie → « Drox (moteur) »**, regarde si le serveur LLM répond. |
| Tools qui modifient ne demandent pas confirmation | Le panneau envoie `applyEdits: true`. Si tu veux la version « proposition seule », lance `agent.run` avec `applyEdits: false` (à exposer dans l'UI plus tard). |

## Contrat protocole

Voir [`docs/architecture/PROTOCOLE-JSONRPC.md`](../docs/architecture/PROTOCOLE-JSONRPC.md).
