# Protocole JSON-RPC (stdio NDJSON)

## Transport

- **Un objet JSON par ligne** sur stdin / stdout (NDJSON).
- Pas de framing LSP `Content-Length`.
- stderr : logs tracing (ne pas parser comme RPC).

Démarrage serveur :

```text
drox --serve
```

Implémentation : `drox-cli` → `jsonrpc::serve_stdio()`.

## Handshake — `initialize`

Le client envoie les capacités et options. Le serveur répond notamment avec :

- `orchestrationPipeline`: `"tui_mono"`
- capacités moteur (outils locaux, versions, …)

Côté client IDE, `clientCapabilities.executableTools` liste les outils que **l’IDE exécute** : le moteur enregistre alors des wrappers **RemoteTool** qui émettent `tool/exec` au lieu d’exécuter en local.

## Méthodes client → serveur

| Méthode | Rôle |
|---------|------|
| `initialize` | Handshake, capabilities |
| `agent.run` | Démarre (ou reprend) un run agent |
| `agent.cancel` | Annule le run en cours |
| `session.list` | Liste des sessions |
| `session.read` | Lit un transcript / métadonnées |
| `session.compact` | Demande de compaction |
| `session.truncateAfterLastUser` | Tronque après le dernier message user |
| `shutdown` | Arrêt propre |

Paramètres typiques de `agent.run` (non exhaustif) : message utilisateur, `cwd` / racines workspace, modèle / provider / clés, mode permission, outils désactivés, images, historique de session, flags thinking (`reasoningEffort`, `thinkingBudget`, …).

## Notifications serveur → client

| Notification | Rôle |
|--------------|------|
| `agent/event` | Événement de run (texte, tool call, phase, erreur, …) |
| `agent/done` | Fin de run (succès, cancel, erreur) |

## Requêtes serveur → client

| Méthode | Rôle |
|---------|------|
| `tool/exec` | Exécuter un outil remote (déclaré dans `executableTools`) |
| `user/ask` | Demande interactive (si `interactiveAsk`) — permissions / questions |

Le client **doit** répondre à `tool/exec` avec le résultat outil (succès ou erreur structurée), sinon la boucle bloque.

## Fichiers

- `drox-engine/drox/crates/drox-cli/src/jsonrpc/mod.rs`
- `…/server.rs`, `handlers.rs`, `protocol.rs`
- `…/remote_tool.rs`
- `…/ide_event_shim.rs`

Doc historique (peut diverger) : `docs/0.0/architecture/PROTOCOLE-JSONRPC.md` si présent.
