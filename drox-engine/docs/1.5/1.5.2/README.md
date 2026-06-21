# Drox 1.5.2 — Configuration moteur depuis l’IDE

**Statut** : **spec en cours** (juin 2026)  
**Prérequis** : [1.5.1](../1.5.1/CLOSURE-1.5.1.md) livrée  
**Branche** : `1.5.2`

---

## En une phrase

Aligner l’IDE sur le **contrat moteur `tui_mono`** (`agent.run`) : sampling complet dans l’onglet **Architecte**, run agent dans **Général**, **purge** du legacy 1.4 — sans réintroduire l’orchestration `role_split`.

---

## Principe

**Moteur d’abord** — l’UI reflète [`AgentRunParams`](../../../drox/crates/drox-cli/src/jsonrpc/protocol.rs), pas l’inverse.

| Zone UI | Contenu |
|---------|---------|
| **Architecte** 🏛 | Modèle, `num_ctx`, **tout le sampling**, `keep_alive` |
| **Général** ⚙ | Connexion, `max_iterations` (50), thinking, langue, outils, comportement IDE |
| **Settings Drox** | Miroir + MAJ — **sans** `engine.tuning.*` ni modes 1.4 |

---

## Pilier

| Pilier | Sujet |
|--------|--------|
| **M1** | Config moteur : wire RPC, panneaux, purge legacy |

---

## Suite (reportée)

| Version | Périmètre |
|---------|-----------|
| [1.5.3](../1.5.3/README.md) | Diffs fil, UX chat, splash phosphore |
| [1.5.4](../1.5.4/README.md) | Release Linux + Authenticode |

---

## Docs

- [PLAN-1.5.2.md](PLAN-1.5.2.md) — spec détaillée (cartographie, purge, critères)

---

## Liens

- [Hub 1.5](../README.md)
- [SHIM-MOTEUR-IDE](../1.5.0/SHIM-MOTEUR-IDE.md)
