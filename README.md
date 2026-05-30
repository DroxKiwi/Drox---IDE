# Drox IDE

**Drox IDE** est un fork privé de [Visual Studio Code — Open Source](https://github.com/microsoft/vscode) (Code - OSS), avec le moteur agent **Drox** intégré nativement dans le workbench : chat dédié, orchestration multi-rôles (architecte / exécuteurs), processus Rust `drox --serve`, inférence **Ollama-first**.

> Dépôt **privé** — propriété KDDS. Le moteur et l’UI Drox ne sont pas publiés séparément du fork.

| | |
|---|---|
| **Base VS Code** | `1.122.0` (`package.json`) |
| **Cap produit Drox** | **1.3.1** — distribution Windows / installeur ([doc](drox-engine/docs/1.3.0/finalisation/CLOSURE-1.3.0.md)) |
| **Onboarding dev** | **[DROX.md](DROX.md)** (~15 min) |
| **Hub documentation** | [drox-engine/docs/README.md](drox-engine/docs/README.md) |

---

## Démarrage rapide

**Prérequis** : Node.js 18+, Rust stable, [Ollama](https://ollama.com) (ou API compatible).

```powershell
npm install
cd drox-engine\drox
cargo build -p drox-cli
cd ..\..

# Terminal 1 — compilation continue
npm run watch

# Terminal 2 — fenêtre IDE
.\scripts\code.bat
```

Dans l’IDE : **Ctrl+Shift+P** → **« Drox: Open Chat »**.  
Configurer le LLM : `drox-engine/drox/.drox/.env` (voir `env.example`).

Détails, smoke tests et dépannage : **[DROX.md](DROX.md)**.

---

## Structure du dépôt

```
Drox---IDE/
├── drox-engine/              # Propriété Drox (hors noyau Microsoft)
│   ├── drox/                   # Workspace Rust — moteur (drox-cli --serve)
│   ├── docs/                   # Plans, specs, suivi par version (1.2.0, 1.3.0…)
│   └── extension-vscode/       # Extension de référence (F5 séparé, pas le runtime IDE)
├── src/vs/workbench/contrib/drox/   # Intégration workbench + chat webview
├── resources/drox/             # Binaire embarqué release (`npm run package-drox`)
├── product.json                # Branding Drox IDE
├── DROX.md                     # Guide développeur
└── (reste)                     # Noyau VS Code — merges upstream
```

### Moteur Rust (`drox-engine/drox/`)

Crates principales : `drox-cli`, `drox-engine`, `drox-tools`, `drox-llm`, `drox-context`, `drox-session`, `drox-permissions`, `drox-mcp`, `drox-types`.

Contrat IDE ↔ moteur : **JSON-RPC NDJSON** sur stdio (`drox --serve`). Spécification : [PROTOCOLE-JSONRPC.md](drox-engine/docs/0.0.0/architecture/PROTOCOLE-JSONRPC.md).

### Intégration IDE

- **Adaptateur** : services workbench, IPC, `tool/exec`, settings `nexus.drox.*`
- **UI** : webview modulaire sous `contrib/drox/browser/media/droxChat/`
- **Patches noyau minimaux** : quelques fichiers hors `contrib/drox` (liste dans [ARCHITECTURE-DECOUPLAGE-UPSTREAM.md](drox-engine/docs/1.2.0/steps/03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md))

La logique agentique ne doit **pas** être dispersée dans `contrib/chat/` ni le noyau VS Code — c’est la condition pour suivre les releases Microsoft sans tout casser.

---

## Documentation par version

| Version | Entrée |
|---------|--------|
| **1.3.0** (en cours) | [drox-engine/docs/1.3.0/README.md](drox-engine/docs/1.3.0/README.md) |
| **1.2.0** (orchestration séquentielle) | [drox-engine/docs/1.2.0/](drox-engine/docs/1.2.0/) |
| Archives & guides | [drox-engine/docs/0.0.0/](drox-engine/docs/0.0.0/) · [GUIDE-MOTEUR-DROX.md](drox-engine/docs/0.0.0/guides/GUIDE-MOTEUR-DROX.md) |

---

## Mises à jour VS Code (upstream)

Le remote **`upstream`** pointe vers `https://github.com/microsoft/vscode.git` (déjà configuré sur ce clone).

**Oui**, vous pouvez intégrer les nouvelles versions de VS Code : le moteur (`drox-engine/`) et l’UI (`contrib/drox/`) vivent dans des arbres **propres au fork** ; Microsoft ne les modifie pas. Seuls ~6 fichiers « crochets » du noyau demandent une résolution manuelle à chaque merge.

**Processus recommandé** :

1. Branche dédiée : `integrate/vscode-<version>`
2. `git fetch upstream` puis merge de `upstream/main` (ou tag release)
3. Résoudre : `product.json` → patches §5 du doc upstream → `contrib/drox/` → **ne pas écraser** `drox-engine/` sauf accident
4. Valider : `npm run compile`, `cargo test --workspace` dans `drox-engine/drox`, smoke chat Drox

Guides détaillés :

- [ARCHITECTURE-DECOUPLAGE-UPSTREAM.md](drox-engine/docs/1.2.0/steps/03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md)
- [PLAN-UPSTREAM-1.122.md](drox-engine/docs/1.2.0/steps/03-upstream/PLAN-UPSTREAM-1.122.md)

**Note historique** : ce dépôt a été importé en snapshot squashed (`Export Drox IDE 1.3.0`). L’historique Git n’est plus linéaire avec l’ancien fork public, mais l’**arbre de fichiers** reste mergeable avec `upstream/main` comme un fork classique.

---

## CI & packaging

| Commande | Rôle |
|----------|------|
| `npm run watch` / `compile` | IDE + contrib Drox |
| `cargo build -p drox-cli` | Binaire moteur seul |
| `npm run package-drox` | Embarque `drox` dans `resources/drox/` |
| `npm run test-drox` | Tests unitaires workbench Drox |

Workflow GitHub : [.github/workflows/drox-rust.yml](.github/workflows/drox-rust.yml) (fmt, clippy, tests Rust sur `drox-engine/drox/`).

---

## Licence

- **Noyau VS Code** : [MIT](LICENSE.txt) — Copyright Microsoft Corporation.
- **Drox** (`drox-engine/`, `contrib/drox/`, branding) : travail KDDS — même base MIT pour le code dérivé du fork OSS.

Les marques *Visual Studio Code* et *VS Code* appartiennent à Microsoft. *Drox IDE* est une distribution distincte non affiliée.
