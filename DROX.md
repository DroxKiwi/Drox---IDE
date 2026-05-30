# Drox — démarrage rapide (Drox IDE)

Guide **onboarding (< 15 min)** pour l’agent Drox intégré nativement dans ce fork VS Code.  
Moteur Rust : `drox-engine/drox/` · UI workbench : `src/vs/workbench/contrib/drox/`.

| Document | Contenu |
|----------|---------|
| [**drox-engine/docs/README.md**](drox-engine/docs/README.md) | **Hub documentation** (plans, suivi, guides, architecture, UI) |
| [drox-engine/docs/guides/GUIDE-MOTEUR-DROX.md](drox-engine/docs/guides/GUIDE-MOTEUR-DROX.md) | Mécaniques moteur (phases, tools, JSON-RPC) — **§18 = intégration fork** |
| [drox-engine/docs/plans/PLAN-INTEGRATION.md](drox-engine/docs/plans/PLAN-INTEGRATION.md) | Plan de portage extension → workbench |
| [drox-engine/docs/plans/PLAN-MODELES-TIER.md](drox-engine/docs/plans/PLAN-MODELES-TIER.md) | **Suivi actif** — profils `modelTier` low/medium (§8 avancement) |
| [drox-engine/docs/ide/UI-PHASE1-CHAT-NATIF.md](drox-engine/docs/ide/UI-PHASE1-CHAT-NATIF.md) | Première passe UI — chat natif (type Cursor) |
| [resources/drox/README.md](resources/drox/README.md) | Binaire embarqué release (`npm run package-drox`) |
| [drox-engine/extension-vscode/README.md](drox-engine/extension-vscode/README.md) | Extension de **référence** (F5 séparé, non requis en prod) |

---

## Prérequis

| Outil | Version indicative |
|-------|-------------------|
| **Node.js** | 18+ (voir `.nvmrc` / wiki VS Code) |
| **Rust** | stable (`rustup`) — binaire `drox` |
| **Ollama** (ou API compatible) | `http://localhost:11434` par défaut |

---

## Parcours dev (~15 min)

### 1. Dépendances (une fois)

```powershell
# Racine du fork
npm install
cd drox-engine\drox
cargo build -p drox-cli
cd ..\..
```

### 2. Lancer l’IDE

Terminal A — compilation continue :

```powershell
npm run watch
```

Terminal B — fenêtre Electron :

```powershell
.\scripts\code.bat
```

> Premier lancement : `npm run electron` si `.build\electron\` est absent.

### 3. Workspace & LLM

1. **Fichier → Ouvrir le dossier…** → racine de ce repo (pour trouver `drox-engine/drox/target/debug/drox.exe`).
2. Créer `drox-engine/drox/.drox/.env` à partir de `drox-engine/drox/.drox/env.example` :

```env
DROX_SERVER=http://localhost:11434
DROX_MODEL=llama3.2
```

3. Démarrer Ollama et tirer le modèle si besoin : `ollama pull llama3.2`.

### 4. Ouvrir le chat Drox

- **Palette** (`Ctrl+Shift+P`) → **« Drox: Open Chat »** (`workbench.action.openDroxChat`).
- Ou vue **Drox** dans la barre latérale.
- Envoyer un message test.

### 5. Vérifier les logs

| Canal Sortie | Contenu |
|--------------|---------|
| **Drox (moteur)** | stderr du processus `drox --serve` |
| **Drox (bash)** | commandes shell exécutées côté IDE |
| **Drox (UI)** | événements webview / pont |

Réglages : palette → **« Drox: Open Settings »** ou recherche `drox` dans Paramètres.

---

## Réglages IDE (`drox.*`)

| Clé | Rôle |
|-----|------|
| `drox.executablePath` | Chemin forcé vers `drox` (sinon auto-détection) |
| `drox.server` | URL LLM (sinon `.drox/env` / défaut Ollama) |
| `drox.architect.model` | Modèle **Architecte** (ex. modèle principal chat ; repli `drox.model`) |
| `drox.executor.model` | Modèle **Exécutant** (ex. sous-agents ; repli `drox.subagents.model`) |
| `drox.confirmFileWrites` | Confirmation avant écriture fichier |
| `drox.openModifiedFiles` | Ouvrir l’éditeur après `file_edit` / `file_write` |
| `drox.warmStart` | Pré-lance `drox --serve` + handshake après ouverture IDE (défaut `true`) |
| `drox.tools.disabled` | Liste d’outils désactivés |
| `drox.tools.mcp.enabled` | MCP dynamiques |

Résolution du binaire (sans setting) : workspace `drox-engine/drox/target/{debug,release}/` → `resources/drox/<plateforme>/` → `PATH`.

---

## Commandes utiles

```powershell
npm run test-drox          # tests unitaires contrib Drox (après compile)
npm run package-drox       # copie release → resources/drox/<plateforme>/
.\scripts\test-drox.ps1    # alias tests
```

Smoke RPC manuel : [drox-engine/docs/operations/SMOKE-RPC.md](drox-engine/docs/operations/SMOKE-RPC.md).

---

## Dépannage rapide

| Symptôme | Action |
|----------|--------|
| Spawn / binaire introuvable | `cargo build -p drox-cli` dans `drox-engine/drox` ; ou `drox.executablePath` |
| Écran blanc / `Failed to fetch workbench.desktop.main.js` | `out/` incomplet : laisser `npm run watch` finir sa 1re compilation, ou `npm run gulp -- transpile-client`, puis relancer `code.bat` |
| Chat vide, pas de réponse | Sortie **Drox (moteur)** ; Ollama joignable ? modèle tiré ? |
| « Remote API disabled » / erreur LLM | Vérifier `DROX_SERVER` / `drox.server` |
| Extension vs fork | **Ne pas** installer l’extension marketplace : le chat natif est dans `contrib/drox` |

---

## Build release (Windows x64)

Script unique (F1 — application packagée) :

```powershell
npm run build-release-win32
# ou avec installeur Inno (F2) :
.\scripts\build-release-win32.ps1 -WithSetup
```

Enchaîne : `package-drox` → `gulp core-ci` → `vscode-win32-x64-min-ci` → `inno-updater`.  
Sortie : `..\VSCode-win32-x64\Drox IDE.exe` (dossier parent du repo).

Options : `-SkipNpmInstall`, `-SkipElectron`, `-SkipCompile` (re-package seulement), `-WithInnoUpdaterOnly`.

Plan complet : [drox-engine/docs/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md](drox-engine/docs/1.3.0/finalisation/PLAN-DISTRIBUTION-LAUNCHER.md).

L’utilisateur final n’a **pas** besoin de Rust si le binaire est embarqué dans `resources/drox/`.

---

*Drox IDE — moteur Drox intégré au workbench. Le code de référence extension reste dans `drox-engine/extension-vscode/` à titre de comparaison uniquement.*
