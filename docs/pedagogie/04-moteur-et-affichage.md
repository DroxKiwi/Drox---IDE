Rédigé à l'aide de Cursor Agent

# Du moteur à l’écran — comment le chat affiche ce que Rust produit

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : le **lien** entre le moteur Rust (processus `drox --serve`) et **l’affichage** dans l’IDE (bulles de chat, widgets d’outils, phases).

Tout au long de ce texte, nous détaillerons :

- **ce qu’est** un événement (`AgentEvent`) ;
- **comment** il traverse un canal puis le JSON-RPC ;
- **pourquoi** moteur et UI sont deux programmes séparés ;
- **à quoi ça sert** (stream en direct, stop, tool/exec).

Socle : [01-contact-ollama.md](01-contact-ollama.md). Boucle : [02-boucle-agent.md](02-boucle-agent.md). Erreurs : [03-gestion-erreurs.md](03-gestion-erreurs.md).

### L’histoire en une phrase

Le moteur **ne dessine pas** les pixels du chat. Il **émet des faits** (« voici 3 caractères de plus », « l’outil grep a fini », « le run est terminé »). L’IDE **écoute** ces faits et met à jour l’interface.

### Fichiers à laisser ouverts

| Côté | Fichier | Rôle |
|------|---------|------|
| Moteur | [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs) | Définition des `AgentEvent` |
| Moteur | [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) | `tx.send(Ok(AgentEvent::…))` |
| Moteur | [`ide_event_shim.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/ide_event_shim.rs) | Adaptation éventuelle pour l’UI |
| Moteur | [`server.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/server.rs) / handlers | Notification `agent/event` |
| IDE | [`droxAgentRunBridge.ts`](../../src/vs/workbench/contrib/drox/common/droxAgentRunBridge.ts) | Pont run côté workbench |
| IDE | [`droxEngineService.ts`](../../src/vs/workbench/contrib/drox/electron-browser/droxEngineService.ts) | Service renderer |
| Doc | [ide-integration.md](../engine/ide-integration.md) · [tutoriel UI](../tutorials/ide-navigation.md) | Contrat / navigation |

```text
drive_inner
  → tx.send(AgentEvent)          (canal Tokio dans le process drox)
  → JSON-RPC notification agent/event   (stdout NDJSON)
  → process Electron (main) écoute stdio
  → bridge / services TypeScript
  → widgets chat (markdown, tools, phases)
```

---

## Partie A — Deux processus, un tuyau

Quand tu utilises Drox IDE :

1. **Electron** (l’éditeur) lance `drox --serve` comme **processus enfant**.
2. Ils se parlent par **stdin/stdout** en JSON ligne par ligne (NDJSON).

**Pourquoi séparer ?**

- Si le moteur plante, l’éditeur peut survivre et afficher l’erreur.
- Le moteur reste un binaire Rust réutilisable (TUI, CLI, autres clients).
- L’UI reste dans l’écosystème TypeScript de VS Code / Code OSS.

**Côté machine** : deux espaces mémoire distincts. On ne partage pas un pointeur Rust avec le JS : on **copie** des messages sérialisés (texte JSON) à travers le tuyau du système d’exploitation.

Détail du protocole : [jsonrpc-protocol.md](../engine/jsonrpc-protocol.md).

---

## Partie B — Qu’est-ce qu’un événement ?

Un **`AgentEvent`**, c’est une **petite structure de données** qui dit : « quelque chose d’intéressant vient d’arriver dans le run ».

Exemples de variantes (voir [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs)) :

| Variante (idée) | Ce que l’UI peut en faire |
|-----------------|---------------------------|
| `TextDelta { text }` | Ajouter du texte à la bulle en cours |
| `PhaseEnter { phase }` | Afficher « reading », « acting », … |
| `ToolStart` / `ToolFinish` | Carte d’outil (grep, bash, …) |
| `ContextSnip` / `ContextCompacted` | Indicateur de compaction |
| `Stop` | Fin d’un tour LLM |

En Rust, c’est souvent un **`enum`** : une famille de cas possibles, chacun avec ses champs.  
**Côté machine** : une étiquette (quel cas ?) + les données du cas. Exactement comme `Result` et `Option`, mais avec plus de variantes métier.

---

## Partie C — Le canal (`tx` / `rx`) : file d’attente en mémoire

Dans `Agent::run`, le moteur crée typiquement une paire :

- `tx` (**transmitter**) : côté **envoi**, utilisé dans `drive_inner` ;
- `rx` (**receiver**) : côté **réception**, lu pour fabriquer le stream exposé / les notifications RPC.

Analogie : un **tube pneumatique** dans le même bâtiment (`drox`).  
`drive_inner` glisse des messages (`tx.send(...)`). Un autre bout du code les récupère dans l’ordre.

```rust
// idée
tx.send(Ok(AgentEvent::TextDelta { text: "Bon".into() })).await?;
```

| Élément | Sens |
|---------|------|
| `tx.send(...)` | Dépose un message dans la file |
| `.await` | Attend qu’il y ait de la place / que l’envoi soit pris en compte |
| `Ok(...)` | Ici le canal transporte aussi des `Result` (événement ou erreur) |

Si plus personne n’écoute (`rx` fermé), l’envoi échoue : le moteur peut alors **arrêter** proprement (plus d’UI = plus la peine de continuer).

---

## Partie D — Franchir la frontière : `agent/event`

Le serveur JSON-RPC sérialise l’événement en JSON et écrit une **notification** sur stdout, du genre :

```json
{"jsonrpc":"2.0","method":"agent/event","params":{"run_id":"…","event":{…}}}
```

| Mot | Sens |
|-----|------|
| notification | Message **sans** attendre de réponse (contrairement à une `request`) |
| `run_id` | De quel run il s’agit (plusieurs conversations possibles) |
| `event` | Le contenu sérialisé de l’`AgentEvent` |

L’IDE parse la ligne, trouve le bon run, et met à jour le DOM / les parts de chat.

Le **shim** (`ide_event_shim`) peut encore **traduire** certaines phases en anciens marqueurs `rail_station_*` pour des écrans historiques — le moteur `tui_mono` parle phases ; l’UI legacy parle parfois « stations ».

---

## Partie E — Dans l’autre sens : l’UI parle au moteur

Ce n’est pas à sens unique.

| Direction | Exemple |
|-----------|---------|
| UI → moteur | `agent.run`, `agent.cancel` |
| Moteur → UI | `agent/event`, `agent/done` |
| Moteur → UI → moteur | `tool/exec` (l’IDE exécute LSP/FS) puis **répond** avec le résultat |
| Moteur → UI → moteur | `user/ask` (permission / question) puis réponses |

Pour `tool/exec`, si l’IDE ne répond jamais, la **boucle** du guide 02 reste bloquée en attendant : d’où l’importance du pont TypeScript (`droxClientTools`, etc.).

---

## Partie F — Ce que tu vois concrètement

| Tu vois dans le chat | En général, côté moteur |
|----------------------|-------------------------|
| Texte qui s’écrit en direct | Une suite de `TextDelta` |
| Pastille de phase | `PhaseEnter` |
| Carte « Ran grep » | `ToolStart` puis `ToolFinish` |
| Run rouge / message d’erreur | `Err` sur le canal ou `agent/done` status `error` |
| Bouton Stop | `agent.cancel` → la boucle s’interrompt |

Le tutoriel d’interface (où cliquer) : [ide-navigation.md](../tutorials/ide-navigation.md).  
Ici on a vu **pourquoi** ces pixels bougent.

---

## Récapitulatif

1. Moteur et IDE = **deux processus** reliés par NDJSON.
2. Le moteur émet des **`AgentEvent`** via un **canal** interne puis des notifications RPC.
3. L’IDE **interprète** ces événements pour peindre le chat.
4. L’UI peut **répondre** (`tool/exec`, `user/ask`) — sans ça, la boucle agent ne peut pas avancer.

## Suite possible (même série)

- Exécution d’un outil local vs remote (permissions + `RemoteTool`).
- Compaction visible (`ContextCompacted`) et mémoire.

Index : [README.md](README.md) · référence [ide-integration.md](../engine/ide-integration.md).
