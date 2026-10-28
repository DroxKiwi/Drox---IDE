<p align="center">
  <img src="https://raw.githubusercontent.com/DroxKiwi/Droxkiwi/main/logo3.png" width="120" alt="Logo Drox" />
</p>

# Drox IDE

Éditeur de code avec un agent IA **open source**, prêt à l’installation. Il reprend [Visual Studio Code – Open Source (Code OSS)](https://github.com/microsoft/vscode) : extensions, terminal, Git, LSP — et y ajoute un moteur agent en Rust qui tourne **chez toi**.

Installeurs Windows et Linux : [**télécharger la 1.6.2**](https://github.com/DroxKiwi/Drox---IDE/releases/latest).

Drox IDE est référencé sur la page contributeur du [XERJ Corpus Hub](https://hub.xerj.org/contributors/DroxKiwi).

## En usage

- **Aucune télémétrie** Drox / KDDS.
- **Aucun cloud imposé** pour l’agent. Tu branches [Ollama](https://ollama.com/) en local, un provider du catalogue (Mistral, vLLM, LM Studio, Hugging Face, Scaleway, OVH, …) ou n’importe quel serveur **OpenAI-compatible**. URL et clés sont les tiennes. Détail : [llm-backends](docs/engine/llm-backends.md).
- Session, transcripts et réglages **sur ta machine** (`%APPDATA%\.drox-ide`, workspace).

| | |
|---|---|
| **Licence** | MIT — Code OSS (Microsoft) + portions Drox / KDDS — [`NOTICE.md`](NOTICE.md) |
| **Version** | **1.6.2** · base VS Code **1.127.0** |
| **Binaires** | [Releases](https://github.com/DroxKiwi/Drox---IDE/releases) — Windows et Linux |
| **Doc moteur** | [`docs/engine/`](docs/engine/README.md) |
| **Référencement** | [XERJ Corpus Hub — DroxKiwi](https://hub.xerj.org/contributors/DroxKiwi) |

```powershell
npm install
npm run watch
.\scripts\code.bat
```

---

## Historique

Jalons (git + releases). Détail par version : [`docs/1.5/`](docs/1.5/README.md), [`docs/1.6/`](docs/1.6/README.md).

| Période | Jalons | En bref |
|---------|--------|---------|
| **Avant mai 2026** | — | Moteur Rust + **Drox TUI** : boucle agent hors IDE. |
| **Mai 2026** | **28 mai** · **30 mai – 2 juin** · **début juin** | **1.3.0** squash fork · **1.3.1** Windows (Inno, moteur embarqué) · **1.3.2–1.3.4** MAJ / stabilisation. |
| **Juin 2026** | **8–11 juin** · **11–18 juin** · **19 juin** · **20–26 juin** | **1.4.x** Run Rail (labo, [`docs/1.4/`](docs/1.4/)) · **1.5.0–1.5.6** VS Code **1.126/1.127**, `tui_mono`, chat, builds Win/Linux. |
| **Juil. – août 2026** | — | **1.5.9 → 1.5.19** : Agents, chat natif, MCP, sessions, loop detector, multi-provider, handoff Agents→IDE. |
| **Sept. 2026** | **fin septembre** · **28 septembre** | **1.5.20** (Commit/Push chat, sidebar Changes, params LLM) · **MIT** + releases sur ce dépôt, docs engine publiques. |
| **Oct. 2026** | **1.6.0** · **1.6.1** · **1.6.2** | **1.6.0** freeze moteur (anti-boucle, compaction, Explore/contrats) · **1.6.1** profils `local-9b` / `local-27b` / `cloud-full`, sous-run Explore, polish IDE · **1.6.2** onglets de chat, runs parallèles, connexions enregistrées, thème Agents — release **`v1.6.2`**. |

### Dogfood — 28 octobre 2026

Analyse et explication d’un répertoire de code jeune et simple. Trois runs sans faute, un par profil moteur, via Ollama (le dernier sur Ollama Cloud).

| Modèle | Mode |
|--------|------|
| `nemotron-3.5-bolt:e4b` | Small model (`local-9b`) |
| `ornith1.5:35b` 8bit | Local capable (`local-27b`) |
| `glm-5.3-flash` | Full protocol (`cloud-full`) |

---

## Pourquoi cet outil existe

**Cursor** a montré l’intérêt d’un agent dans l’éditeur ; Drox vise un **confort comparable en local**, données chez toi, sans dépendre du cloud du vendeur.

Pendant le dev, Cursor a servi d’**accélérateur de code et de réflexion** ; cadrage produit, features et design restent pilotés ici. C’est ce type d’accélération que je veux **ouvert et maîtrisable** avec Drox.

---

## Présentation technique (cours express)

Détail : [`docs/engine/`](docs/engine/README.md).

### 1. Trois briques

```text
Toi + repo  ↔  Drox IDE (fork + UI Agents)  ↔  drox.exe (Rust, JSON-RPC)
                                                      ↕
                         ton inférence : Ollama · catalogue (Mistral, …) · OpenAI-compat
```

### 2. Moteur Rust

Binaire `drox --serve` : boucles LLM, outils, permissions, sessions. Workbench reste en **TypeScript** (`src/vs/workbench/contrib/drox/`).  
Côté inférence, `drox-llm` parle **Ollama** (`/api/chat`) ou **Chat Completions** (SSE) via adaptateurs catalogue — le cœur agent ne dépend pas d’un fournisseur précis.

### 3. Crates (`drox-engine/drox/`)

`drox-types` · `drox-llm` · `drox-tools` · `drox-engine` (boucle `drive_inner`) · `drox-cli` · `drox-tui` · `drox-prompts`.

### 4. Un « run »

`initialize` → `agent.run` → stream LLM + tools (local ou `tool/exec` IDE) → `agent/event` → fin (`Stop` / protocole phases selon profil moteur).

### 5. Où lire la suite

| Sujet | Doc |
|-------|-----|
| Index moteur | [docs/engine/](docs/engine/README.md) |
| Pédagogie | [docs/pedagogie/](docs/pedagogie/README.md) |
| Architecture · RPC · boucle · phases · outils · sessions | [architecture-overview](docs/engine/architecture-overview.md) · [jsonrpc-protocol](docs/engine/jsonrpc-protocol.md) · [agent-run-loop](docs/engine/agent-run-loop.md) · [system-prompts-and-phases](docs/engine/system-prompts-and-phases.md) · [tools-and-permissions](docs/engine/tools-and-permissions.md) · [sessions-and-memory](docs/engine/sessions-and-memory.md) |
| LLM · MCP · IDE · TUI | [llm-backends](docs/engine/llm-backends.md) · [mcp-and-subagents](docs/engine/mcp-and-subagents.md) · [ide-integration](docs/engine/ide-integration.md) · [clients-tui-vs-rpc](docs/engine/clients-tui-vs-rpc.md) |
| UI IDE · build | [tutorials/ide-navigation](docs/tutorials/ide-navigation.md) · [docs/release/](docs/release/README.md) |

Env : [`drox-engine/DROX-ENV-SETUP.txt`](drox-engine/DROX-ENV-SETUP.txt).

---

## Remerciements

Merci au **SI de [Salesky](https://www.salesky.fr/)** pour les tests et le matériel.

---

## Licence

MIT. Code OSS © Microsoft ; portions Drox / KDDS © KDDS — [`NOTICE.md`](NOTICE.md) · [`LICENSE.txt`](LICENSE.txt).
