# Drox IDE

Éditeur de code avec agent IA, **open source**, basé sur [Visual Studio Code – Open Source (Code OSS)](https://github.com/microsoft/vscode).

## But du projet

Je veux m’approprier un éditeur IA **entièrement open source**, en m’appuyant sur la puissance du moteur VS Code (édition, extensions, terminal, git, LSP), sans dépendre d’un produit fermé.

Principes non négociables :

- **Aucune télémétrie** Drox / KDDS.
- **Aucun appel imposé** vers des clouds tiers pour faire tourner l’agent.
- Données de session, transcripts et réglages **sur ta machine** (`%APPDATA%\.drox-ide`, fichiers du workspace).
- Le LLM, c’est **le tien** : [Ollama](https://ollama.com/) en local, ou un endpoint OpenAI-compatible que **tu** configures.

Tu gardes le confort d’un agent qui lit, planifie et modifie le code — avec une souveraineté réelle sur la pile.

| | |
|---|---|
| **Licence** | MIT — Code OSS (Microsoft) + portions Drox / KDDS — [`NOTICE.md`](NOTICE.md) |
| **Version** | **1.5.20** · base VS Code **1.127.0** |
| **Binaires** | [Releases](https://github.com/DroxKiwi/Drox---IDE/releases) |
| **Doc moteur** | [`docs/engine/`](docs/engine/README.md) |
| **État** | Expérimental / dogfood — bugs et cassures possibles |

```powershell
npm install
npm run watch
.\scripts\code.bat
```

---

## Historique

Les dates ci-dessous s’appuient sur l’historique git de ce dépôt (export squash puis releases successives).

### Avant mai 2026 — laboratoire

J’ai d’abord fait vivre le moteur agent comme un chantier Rust + expériences d’orchestration (boucle LLM, outils, permissions), avec un client terminal (**Drox TUI**) pour valider le comportement hors IDE. L’idée : un cerveau agent réutilisable, pas seulement une UI.

### Mai 2026 — naissance de Drox IDE dans ce dépôt

| Date | Étape |
|------|--------|
| **28 mai** | Export squash **1.3.0** : fork Code OSS + couche Drox. Premier README « dépôt privé ». |
| **30 mai – 2 juin** | **1.3.1** : distribution Windows (Inno Setup, icônes, moteur embarqué), pipeline `drox:ship`. |
| **début juin** | **1.3.2 – 1.3.4** : notification de MAJ, stabilisation moteur, cycles courts de release. |

### Juin 2026 — refonte moteur puis remontée VS Code

| Date | Étape |
|------|--------|
| **8–11 juin** | **1.4.0** : refonte **Run Rail** (squelette, stations, hold/advance, UI). |
| **11–18 juin** | **1.4.1** : discuss, busy UI, gates, contexte architecte, profils dev/release. |
| **19 juin** | **1.4.2** : rail **observateur**, quatre couches de contexte, fin des reliquats trop prescriptifs — point d’arrêt avant une autre refonte. |
| **20–26 juin** | **1.5.0 – 1.5.6** : ancrage sur VS Code **1.126 / 1.127**, pipeline **`tui_mono`**, fil chat, config `agent.run`, builds Windows **et** Linux, correctifs UX massifs. |

La 1.4.x m’a servi de laboratoire : beaucoup de ce que j’ai appris (et de ce que je ne veux plus) est documenté sous [`docs/1.4/`](docs/1.4/). Le produit courant ne prolonge pas ce rail tel quel.

### Juillet – août 2026 — surface Agents et durcissement

Ligne **1.5.9 → 1.5.19** : récupération de runs, chat natif, fenêtre Agents, marketplace MCP, sessions, loop detector, multi-provider LLM, handoff Agents→IDE, Git Graph, mutateurs agent, etc. Rythme de release élevé — dogfood agressif.

### Septembre 2026 — 1.5.20 et ouverture totale

| Date | Étape |
|------|--------|
| **fin septembre** | **1.5.20** : Commit/Push dans le chat IDE, Changes Sidebar, mute des params LLM, thinking budget, correctifs Qwen/LiteLLM. |
| **28 septembre** | Décision produit : **dévoiler complètement** le code. Licence MIT unifiée, docs moteur publiques (`docs/engine/`), canal Releases sur **ce** dépôt (plus le miroir OR). |

Aujourd’hui je pense ce dépôt pour la communauté : cloner, forker, lire, contribuer — ou simplement télécharger l’installeur.

---

## Pourquoi cet outil existe

Des outils comme **Cursor** ont montré qu’un agent dans l’éditeur change le quotidien. Ils restent des produits d’entreprise : compte, cloud, règles du vendeur.

Drox est né de mon besoin de **retrouver un confort comparable** — certes avec moins de puissance brute et moins de polish — **sans dépendre d’une société** pour le cœur local. Assez pour travailler sereinement, avec des données qui restent chez toi.

Pendant le développement, **Cursor a été un outil**, pas le propriétaire du projet :

- il **traduit mes demandes en code** ; la **maîtrise des features**, les arbitrages produit et la responsabilité du design restent les miens ;
- il m’a servi à de **grosses phases de réflexion** : prendre du recul sur des questions qui m’auraient mangé des semaines avant d’être tranchées ;
- il me permet de **tester rapidement des architectures** qui, auparavant, m’auraient pris des mois à prototyper à la main.

C’est précisément ce confort — accélérer la pensée et l’expérimentation — que je vise à rendre **local et ouvert** avec Drox, pour moi et pour d’autres.

---

## Présentation technique (cours express)

Le détail opératoire vit dans [`docs/engine/`](docs/engine/README.md).

### 1. Trois briques, un poste de travail

```text
Toi + ton repo
      ↕
 Drox IDE  (fork Code OSS + UI Agents / chat)
      ↕  stdio NDJSON (JSON-RPC)
 drox.exe  (moteur Rust)
      ↕  HTTP localhost (ou ton endpoint)
 Ollama / LLM que tu as choisi
```

- **IDE** : tout ce que VS Code sait déjà faire + la surface Drox (`src/vs/workbench/contrib/drox/`).
- **Moteur** : décide les tours LLM, appelle les outils, gère permissions / contexte / session.
- **Modèle** : hors du dépôt — tu branches le serveur d’inférence.

### 2. Pourquoi Rust pour le moteur ?

- **Un binaire** (`drox.exe` / `drox`) portable, démarré par l’IDE via `drox --serve`.
- **Perf et mémoire** prévisibles sur des boucles longues (stream tokens, outils, compaction).
- **Contrôle** : pas de runtime Node pour le cœur agent ; erreurs typées, async Tokio, peu de surprise à l’embarquer dans l’installeur.
- Le workbench reste en **TypeScript** (écosystème VS Code). Je ne réécris pas l’éditeur en Rust — seulement l’agent.

### 3. Pourquoi cette arborescence de crates ?

Workspace : `drox-engine/drox/`.

```text
drox-types          contrats partagés
drox-llm            clients Ollama / OpenAI-compat
drox-tools (+ bash, mcp, permissions, hooks, context, session)
drox-engine         boucle Agent (drive_inner), events
drox-cli            binaire + serveur JSON-RPC
drox-tui            client terminal (même moteur, autre UI)
```

Dépendances **unidirectionnelles** : une crate feuille ne tire pas le monolithe. Tu peux raisonner « permissions » ou « LLM » sans ouvrir tout le workbench.

Côté IDE, le pont vit sous `contrib/drox` : spawn du process, `agent.run`, exécution des outils **remote** (ceux que seul VS Code peut faire : LSP, certains FS, UI).

### 4. Qu’est-ce qu’un « run » ?

1. L’IDE envoie `initialize` puis `agent.run` (message, modèle, cwd, permissions…).
2. Le moteur entre dans `drive_inner` : compacte le contexte si besoin, streame le LLM, exécute des tools (local ou `tool/exec` vers l’IDE), nudges si le protocole dérape.
3. Il émet `agent/event` (texte, tools, phases) puis `agent/done`.

Pipeline actuel : **`tui_mono`** — une boucle claire, plus le vieux split Architecte/Exécuteur côté code.

### 5. Où lire la suite

| Sujet | Doc |
|-------|-----|
| Index moteur (parcours lecture) | [docs/engine/](docs/engine/README.md) |
| Rust lu dans le moteur | [rust-par-le-moteur.md](docs/engine/rust-par-le-moteur.md) · [parcours inférence](docs/engine/rust-parcours-inference.md) |
| Crates & clients | [architecture-overview.md](docs/engine/architecture-overview.md) |
| Protocole NDJSON | [jsonrpc-protocol.md](docs/engine/jsonrpc-protocol.md) |
| Boucle agent | [agent-run-loop.md](docs/engine/agent-run-loop.md) |
| Carte `agent.rs` / gates | [agent-internals.md](docs/engine/agent-internals.md) |
| Prompts & `[phase:]` | [system-prompts-and-phases.md](docs/engine/system-prompts-and-phases.md) |
| Outils & permissions | [tools-and-permissions.md](docs/engine/tools-and-permissions.md) |
| Sessions & mémoire | [sessions-and-memory.md](docs/engine/sessions-and-memory.md) |
| LLM | [llm-backends.md](docs/engine/llm-backends.md) |
| MCP & Explore | [mcp-and-subagents.md](docs/engine/mcp-and-subagents.md) |
| TUI vs `--serve` | [clients-tui-vs-rpc.md](docs/engine/clients-tui-vs-rpc.md) |
| Pont IDE (contrat) | [ide-integration.md](docs/engine/ide-integration.md) |
| Naviguer l’UI IDE | [tutorials/ide-navigation.md](docs/tutorials/ide-navigation.md) |
| Guide contributeur moteur | [developer-guide.md](docs/engine/developer-guide.md) |
| Glossaire | [glossary.md](docs/engine/glossary.md) |
| Build / release | [docs/operations/](docs/operations/README.md) |

Variables d’environnement utiles : [`drox-engine/DROX-ENV-SETUP.txt`](drox-engine/DROX-ENV-SETUP.txt).

---

## Remerciements

Je remercie l’équipe du **SI de [Salesky](https://www.salesky.fr/)** pour l’aide aux tests et pour le matériel mis à disposition — indispensable pour avancer sur cette quête d’autonomie face à des outils comme Cursor.

---

## Licence

MIT. Socle Code OSS © Microsoft ; portions moteur / intégration / branding © KDDS.  
Détail : [`NOTICE.md`](NOTICE.md) · [`LICENSE.txt`](LICENSE.txt).
