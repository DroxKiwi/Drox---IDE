# Carte du moteur Drox — audit & onboarding

**Objectif** : comprendre le moteur **dans sa globalité** en naviguant par **fonctionnalité**, pas par crate ou par fichier au hasard.

**Public** : dev humain qui touche `drox-engine`, `drox-cli`, ou l’intégration IDE.

**Code racine** : `drox-engine/drox/crates/`

---

## Comment utiliser cette arborescence

1. Lire ce README + [CARTE-GLOBALE.md](CARTE-GLOBALE.md) (vue d’ensemble en 5 min).
2. Parcourir les dossiers **01 → 11** dans l’ordre si tu découvres le moteur ; sinon entrer directement dans le dossier qui correspond à ton bug ou ta feature.
3. Chaque dossier contient un `README.md` : rôle, fichiers clés, flux, liens doc existants.
4. Les chemins code sont relatifs à `drox-engine/drox/crates/` sauf mention contraire.

---

## Arborescence (fonctionnalités)

| # | Dossier | Question à laquelle il répond |
|---|---------|-------------------------------|
| 01 | [entree-wire](01-entree-wire/README.md) | Comment un run démarre ? CLI, JSON-RPC, `agent.run` |
| 02 | [boucle-agent](02-boucle-agent/README.md) | Que fait le moteur tour par tour ? `drive`, stream, clôture |
| 03 | [orchestration-prompts](03-orchestration-prompts/README.md) | Architecte / exécuteur / discuss — prompts et tuning |
| 04 | [tools](04-tools/README.md) | Où sont les outils ? Registre, exécution, remote IDE |
| 05 | [permissions-hooks](05-permissions-hooks/README.md) | Qui autorise quoi ? Permissions, bash, hooks |
| 06 | [contexte-memoire](06-contexte-memoire/README.md) | Budget tokens, compaction, sessions, mémoire |
| 07 | [sous-agents](07-sous-agents/README.md) | ~~Explore / delegate~~ — **retiré 1.4.0** (archive) |
| 08 | [gates-nudges-etat](08-gates-nudges-etat/README.md) | Gates, nudges, snapshot architecte, anti-boucle |
| 09 | [run-rail](09-run-rail/README.md) | Conducteur linéaire 1.4.0 (code + archive doc) |
| 10 | [evenements-phases](10-evenements-phases/README.md) | `AgentEvent`, phases UI, marqueurs `[phase:]` |
| 11 | [crates-workspace](11-crates-workspace/README.md) | Satellites : `drox-llm`, `drox-types`, `drox-session`… |

---

## Graphe de dépendance (mental)

```text
IDE / CLI
    └── 01 entree-wire (JSON-RPC)
            └── 02 boucle-agent (drive)
                    ├── 03 orchestration-prompts (system + rôles)
                    ├── 04 tools (registry + exec)
                    ├── 05 permissions-hooks
                    ├── 06 contexte-memoire (avant chaque tour LLM)
                    ├── 08 gates-nudges-etat (décisions intra-tour)
                    ├── 09 run-rail (conducteur architect edit — 1.4.0)
                    └── 10 evenements-phases (sortie vers UI)
```

---

## Parcours lecture recommandé

| Profil | Parcours |
|--------|----------|
| **Nouveau sur Drox** | 01 → 02 → 03 → 04 → [CONDUCTEUR-CODE](../../1.3/1.3.2/CONDUCTEUR-CODE.md) |
| **Bug tool / permission** | 04 → 05 → 02 (`tool_execution.rs`) |
| **Bug prompt / rôle** | 03 → 08 → 02 |
| **Boucle / nudge / stall** | 08 → 02 → 09 |
| **Session / replay / mémoire** | 06 → 01 (`session.rs`) |
| **Refonte conducteur** | 09 + [archive 1.4.0](../archive/1.4.0/README.md) + 08 |

---

## Docs historiques liées

| Doc | Rôle |
|-----|------|
| [GUIDE-MOTEUR-DROX](../../0.0/guides/GUIDE-MOTEUR-DROX.md) | Référence détaillée (phases, tools, permissions) |
| [CONDUCTEUR-CODE](../../1.3/1.3.2/CONDUCTEUR-CODE.md) | Flux prod `role_split` actuel |
| [PROTOCOLE-JSONRPC](../../0.0/architecture/PROTOCOLE-JSONRPC.md) | Contrat wire NDJSON |
| [archive 1.4.0](../archive/1.4.0/README.md) | Run Rail (pause dev) |
| [chat dogfood](../../1.3/chat_qwen27b.txt) | Transcript smoke juin 2026 |

---

## Spec produit active

→ **[FOI-REFONTE](../1.4.0/FOI-REFONTE.md)** (fait foi) · [PLAN-ATTAQUE](../1.4.0/PLAN-ATTAQUE.md)

## Statut

Carte créée **juin 2026** — alignée sur le refactor `agent/loop/` + `agent/core/`. À mettre à jour après table rase (suppression sous-agents, segments, guide 1.3).
