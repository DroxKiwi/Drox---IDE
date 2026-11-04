<p align="center">
  <img src="https://raw.githubusercontent.com/DroxKiwi/Droxkiwi/main/logo3.png" width="120" alt="Logo Drox" />
</p>

# Drox IDE

Éditeur de code avec un agent IA **open source**. Version stable **1.6.4**. Il reprend [Visual Studio Code – Open Source (Code OSS)](https://github.com/microsoft/vscode) : extensions, terminal, Git, LSP — et y ajoute un moteur agent en Rust qui tourne **chez toi**.

Installeurs Windows et Linux : [**télécharger la 1.6.4**](https://github.com/DroxKiwi/Drox---IDE/releases/tag/v1.6.4).

La même installation en ligne de commande. Le script prend la release marquée Latest et remplace une installation déjà présente.

Windows (PowerShell) :

```powershell
irm https://raw.githubusercontent.com/DroxKiwi/Drox---IDE/main/scripts/install/install.ps1 | iex
```

Linux :

```bash
curl -fsSL https://raw.githubusercontent.com/DroxKiwi/Drox---IDE/main/scripts/install/install.sh | bash
```

Drox IDE est référencé sur la page contributeur du [XERJ Corpus Hub](https://hub.xerj.org/contributors/DroxKiwi).

## L’IDE

Le chat Drox est dans la fenêtre de code : explorateur, éditeur, terminal, et la discussion à droite.

<p align="center">
  <img src="image_readme/IDE.png" alt="Drox IDE : éditeur, explorateur et chat" />
</p>

## Le mode Agent

La même discussion en plein écran : sessions à gauche, réponse au centre, panneaux à droite.

<p align="center">
  <img src="image_readme/Agent.png" alt="Mode Agent : session, réponse et panneaux Drox" />
</p>

## Régulation

Après chaque run, Drox note le parcours du modèle sur cinq leviers : budget de contexte, surface d’outils, densité des consignes, strictesse du protocole, posture de recherche. Les notes sont dans le panneau **Regulation**, dans l’IDE et dans Agents. **Auto** peut resserrer un levier quand le run a stressé ; un choix manuel fige ce levier. Détail : [régulation](docs/engine/model-regulation.md).

## Traffic

**Traffic** est le journal des échanges de Drox : appels au modèle, embeddings, MCP, outils, RPC. Chaque ligne indique le sens, la destination et si l’appel a abouti. On peut marquer un hôte d’une couleur, être prévenu quand un appel part vers lui, et garder le journal en mémoire ou sur disque.

## Ports

**Ports** déclare des transferts de ports (HTTP, HTTPS ou TCP) lancés par un outil externe, par exemple ssh ou socat. Pour chaque transfert : hôte et port distants, hôte et port locaux, et ce qui se passe quand le tunnel est prêt — rien, une notification, la prévisualisation, ou le navigateur.

## Codebase

**Codebase** indexe le dossier de la discussion, en local, sous `.drox/codebase-index/`. Drox s’en sert pour retrouver des extraits et les glisser dans le contexte du run. L’index suit le dossier ouvert, dans l’IDE comme dans Agents. Détail : [Codebase et RAG](docs/engine/codebase-and-rag.md).

## En usage

- **Aucune télémétrie** Drox / KDDS.
- **Aucun cloud imposé** pour l’agent. Tu branches [Ollama](https://ollama.com/) en local, un provider du catalogue (Mistral, vLLM, LM Studio, Hugging Face, Scaleway, OVH, …) ou n’importe quel serveur **OpenAI-compatible**. URL et clés sont les tiennes. Détail : [llm-backends](docs/engine/llm-backends.md).
- Session, transcripts et réglages **sur ta machine** (`%APPDATA%\.drox-ide`, workspace).

| | |
|---|---|
| **Licence** | MIT — Code OSS (Microsoft) + portions Drox / KDDS — [`NOTICE.md`](NOTICE.md) |
| **Version** | **1.6.4** stable · base VS Code **1.127.0** |
| **Binaires** | [Releases](https://github.com/DroxKiwi/Drox---IDE/releases) — Windows et Linux |
| **Doc moteur** | [`docs/engine/`](docs/engine/README.md) |
| **Référencement** | [XERJ Corpus Hub — DroxKiwi](https://hub.xerj.org/contributors/DroxKiwi) |

---

## Documentation

- [Hub](docs/README.md)
- [Moteur](docs/engine/README.md)
- [Pédagogie](docs/pedagogie/README.md)
- [Navigation IDE](docs/tutorials/ide-navigation.md)
- [Release](docs/release/README.md)
- [Ligne 1.6](docs/1.6/README.md)

---

## Remerciements

Merci au **SI de [Salesky](https://www.salesky.fr/)** pour les tests et le matériel.

---

## Licence

MIT. Code OSS © Microsoft ; portions Drox / KDDS © KDDS — [`NOTICE.md`](NOTICE.md) · [`LICENSE.txt`](LICENSE.txt).
