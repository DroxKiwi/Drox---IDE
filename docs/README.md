# Documentation Drox — hub

**Racine doc** : ce dossier (`docs/`), anciennement `drox-engine/docs/`.

| Entrée | Pour qui |
|--------|----------|
| **[`engine/`](engine/README.md)** | Comprendre le **moteur actuel** (`tui_mono`) — à lire en premier |
| **[`operations/`](operations/README.md)** | Build, release Windows/Linux, branches |
| **[`1.5/`](1.5/README.md)** | Plans / clôtures ligne 1.5.x |
| **[`1.4/`](1.4/)** · **[`1.3/`](1.3/)** · **[`1.2/`](1.2/)** · **[`0.0/`](0.0/)** | Historique (archives) |
| **[`feature-brainstorm/`](feature-brainstorm/README.md)** | Idées hors train de release |

Onboarding court racine fork : [`../DROX.md`](../DROX.md) (si présent).

---

## Moteur (doc publique de référence)

Voir **[`engine/`](engine/README.md)** :

- [Architecture](engine/architecture-overview.md)
- [JSON-RPC](engine/jsonrpc-protocol.md)
- [Boucle agent](engine/agent-run-loop.md)
- [Outils & permissions](engine/tools-and-permissions.md)
- [Sessions & mémoire](engine/sessions-and-memory.md)
- [Backends LLM](engine/llm-backends.md)
- [Intégration IDE](engine/ide-integration.md)
- [Glossaire](engine/glossary.md)

Carte fonctionnelle historique (audit) : [`1.4/moteur/`](1.4/moteur/README.md) — filtrer les mentions `role_split`.

---

## Opérations

| Guide | Quand |
|-------|--------|
| [operations/README.md](operations/README.md) | Index ops |
| [00-BUILD-REFERENCE.md](operations/00-BUILD-REFERENCE.md) | Quelle commande lancer |
| [03-RELEASE-WINDOWS.md](operations/03-RELEASE-WINDOWS.md) | Ship Windows |
| [04-RELEASE-LINUX.md](operations/04-RELEASE-LINUX.md) | Ship Linux |

---

## Versions (historique)

| Ligne | Statut |
|-------|--------|
| [1.5/](1.5/README.md) | Active (plans 1.5.20+) |
| [1.4/](1.4/) | Archivée / cartes moteur |
| [1.3/](1.3/README.md) | Figée |
| [1.2/](1.2/) · [0.0/](0.0/) | Archives anciennes |
