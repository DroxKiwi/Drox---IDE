# Plan d’implémentation — Drox 1.2.0 (orchestration multi-rôles)

**Date** : 2026-05-20  
**Statut** : **plan actif** — document de pilotage pour appliquer la vision  
**Branche cible** : `1.2.0` (fork + moteur)  
**Prérequis merge** : [PLAN-UPSTREAM-1.122.md](../03-upstream/PLAN-UPSTREAM-1.122.md) — compile + smoke unitaires ✅

**Documents fondateurs**

| Document | Rôle |
|----------|------|
| [VISION-ORCHESTRATION-MULTI-ROLES.md](../01-vision/VISION-ORCHESTRATION-MULTI-ROLES.md) | **Pourquoi** — architecte, séquences, chefs, exécutants |
| [PLAN-CONSTRUCTION-MOTEUR-1.2.0.md](../02-construction/PLAN-CONSTRUCTION-MOTEUR-1.2.0.md) | **Comment découper** — couches A/B/C/D, `RunSpec`, anti-patterns |
| [ARCHITECTURE-DECOUPLAGE-UPSTREAM.md](../03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md) | **Où vit le code** — moteur / UI / fork VS Code |
| **Ce fichier** | **Quoi faire, dans quel ordre** — jalons, checklists, journal |

**Archive (ne plus étendre)** : `docs/0.0.0/plans/PLAN-MODELES-TIER.md`, `PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md`, `PLAN-M5c-SOUS-AGENTS-ASYNC.md`.

---

## 0. Comment utiliser ce plan

1. Lire la **vision** une fois ; travailler au quotidien avec **ce plan** + **construction**.
2. Cocher les cases **`[x]`** au fil des PR ; noter la date dans le **§12 Journal**.
3. Une tâche = une PR ciblée ; pas de mélange extraction `RunSpec` + premier rôle Architecte.
4. Tant que **legacy** n’est pas explicitement retiré, tout smoke produit doit passer en **`DROX_ORCHESTRATION=legacy`** (chemin Medium actuel).

**Critère de succès global 1.2.0** (vision §4) :

- [ ] Tâche **simple** : un chemin direct sans sur-orchestration (équivalent confort Medium sur le résultat).
- [ ] Tâche **complexe** : décomposition visible (séquences / rôles), gros modèle peu d’outils bas niveau, petits modèles sur mutations ciblées.
- [ ] **Couche C** remplaçable sans modifier `drox-tools` ni le wire RPC de base.
- [ ] `cargo test --workspace` + `.\scripts\test-drox.ps1` verts à chaque jalon.

---

## 1. Règles non négociables (rappel)

| # | Règle | Référence |
|---|--------|-----------|
| R1 | **B** (`Agent`, boucle) ne connaît pas `architect` / `modelTier` — seulement `RunSpec` | [PLAN-CONSTRUCTION §2](../02-construction/PLAN-CONSTRUCTION-MOTEUR-1.2.0.md) |
| R2 | **A** (outils, LLM, session) : pas de `if role == …` dans les handlers | idem §8 |
| R3 | **D** (RPC / événements) : changements **additifs** ; IDE non cassé | [ARCHITECTURE-DECOUPLAGE](../03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md) |
| R4 | Chemin **legacy** conservé jusqu’à fin **P5** | Ce plan §4 P2 |
| R5 | UI Drox hors `contrib/chat/` upstream — pas de logique orchestration dans le noyau VS Code | DECOUPLAGE |

---

## 2. Carte des phases (vue d’ensemble)

```text
P0 Spécifications ──► P1 RunSpec (parité Medium) ──► P2 Feature flag
                              │
                              ▼
                    P3 Architecte + Exécutant (MVP)
                              │
                              ▼
                    P4 Chefs + récursion + parallèle
                              │
                              ▼
                    P5 Décommission Low/Medium + doc
```

| Phase | Objectif | Statut |
|-------|----------|--------|
| **P0** | Specs interfaces + séquences + outils par rôle | 🔧 brouillons créés |
| **P1** | `RunSpec` ; `Agent` découplé de `RunPolicy` | ✅ |
| **P2** | `legacy` \| `v1_2` ; RPC optionnel | ✅ |
| **P3** | MVP 2 rôles + délégation `delegate_executor` | ✅ code · P3-9 smoke manuel à cocher |
| **P3b** | Qualité architecte (gates, partial/failed, briefs, UI linéaire) | ✅ code · validation §6 vision à cocher |
| **P4** | Chefs, synthèse parent, parallèle séquences | ⬜ |
| **P5** | Retrait tier Low/Medium du défaut ; doc finale | ⬜ |
| **PI** | IDE : affichage rôles, settings orchestration | ⬜ (parallèle P2+) |

Légende statut : ⬜ à faire · 🔧 en cours · ✅ terminé · ⏸ reporté

---

## 3. P0 — Spécifications (bloquant code C)

| Id | Livrable | Contenu minimal | Statut |
|----|----------|-----------------|--------|
| P0-1 | [SPEC-INTERFACES-RUN.md](../05-spec-p0/SPEC-INTERFACES-RUN.md) | Types `RunSpec`, `RunUnit`, `RunPlan`, `RunResult` ; traits `RunExecutor`, `FlowCoordinator` | ⬜ |
| P0-2 | [SPEC-SEQUENCES-ET-OBJECTIFS.md](../05-spec-p0/SPEC-SEQUENCES-ET-OBJECTIFS.md) | `sequence_id`, `objectives[]`, statuts, dépendances, livrable | ⬜ |
| P0-3 | [SPEC-OUTILS-PAR-ROLE.md](../05-spec-p0/SPEC-OUTILS-PAR-ROLE.md) | Matrice architecte / chef / exécutant × tools | ⬜ |
| P0-4 | Validation croisée | Relecture vision §2–3 ↔ specs ; pas de trou sur synthèse parent | ⬜ |

**Done P0** : les trois SPEC existent ; équipe peut implémenter P1 sans rediscuter le format séquence.

---

## 4. P1 — Extraction `RunSpec` (parité comportementale)

**But** : préparer la couche **C** sans changer le produit visible (Medium = legacy).

| Id | Tâche | Fichiers / zone | Statut |
|----|-------|-----------------|--------|
| P1-1 | Introduire `RunSpec`, `RunLimits`, `RoleId` dans `drox-engine/src/run_spec/` | ✅ `run_spec/mod.rs` |
| P1-2 | `RunSpec::from_run_policy` / `to_run_policy` | mapping depuis `RunPolicy` | ✅ |
| P1-3 | `AgentConfig.run_spec` + `run_policy()` pont | `agent/mod.rs`, `loop.rs`, RPC | ✅ |
| P1-4 | `assemble` / registry : allowlist & supplements via `RunSpec` / `RoleId` | `assemble.rs`, `registry.rs`, `agent_run.rs` | ✅ |
| P1-5 | Tests parité : roundtrip Medium/Low | `run_spec` tests | ✅ |
| P1-6 | `cargo test -p drox-engine` + `test-drox.ps1` | CI locale | ✅ |

**Done P1** : avec flag implicite legacy, comportement identique au moteur pré-P1 (test parité vert).

---

## 5. P2 — Feature flag et façade RPC

| Id | Tâche | Détail | Statut |
|----|-------|--------|--------|
| P2-1 | Module `drox-engine/src/orchestration/` | `orchestration/mod.rs` | ✅ |
| P2-2 | Env `DROX_ORCHESTRATION=legacy\|v1_2` + défaut `legacy` | `OrchestrationMode::resolve` | ✅ |
| P2-3 | `agent.run` : `orchestrationMode` (additif) | `protocol.rs`, `agent_run.rs` | ✅ |
| P2-4 | Branche `legacy` → `prepare_run_spec(Legacy, …)` | inchangé produit | ✅ |
| P2-5 | Branche `v1_2` → stub → legacy | log + tests parité | ✅ |
| P2-6 | Doc flag | [ORCHESTRATION-FLAG.md](../06-flag/ORCHESTRATION-FLAG.md), PROTOCOLE | ✅ |

**Done P2** : bascule CLI documentée ; IDE inchangé si param absent.

---

## 6. P3 — MVP multi-rôles (2 rôles + séquences linéaires)

**Alignement vision** : §2.1 Architecte + §2.4 Exécutant ; séquences §2.2 (linéaire d’abord).

| Id | Tâche | Détail | Statut |
|----|-------|--------|--------|
| P3-1 | `OrchestrationConfig::from_agent_run` — recycle `architect.model` + `executor.model` (ex model / subagents.model) | `config.rs`, `droxConfiguration.ts` | ✅ |
| P3-2 | Prompt système **Architecte** (plan, séquences, pas mutation principale) | `orchestration/prompts.rs` | ✅ |
| P3-3 | Prompt système **Exécutant** (périmètre étroit, mutation) | idem | ✅ |
| P3-4 | Plan visible `todo_write` (remplace l’ancien `V12Plan` JSON) | gates + `todo_write` | ✅ |
| P3-5 | Délégation sync : `delegate_executor` → exécutant aveugle | `orchestration_delegate.rs` | ✅ |
| P3-6 | Synthèse finale utilisateur | `[phase: answering]` architecte | ✅ |
| P3-7 | Événements `RoleEnter { role_id }` | `event.rs`, stream RPC | ✅ |
| P3-8 | Tests unitaires prompts + config + gates | `orchestration/*`, `architect_*` | ✅ |
| P3-9 | Smoke manuel IDE | [SMOKE-ORCHESTRATION-1.2.0.md](../11-operations/SMOKE-ORCHESTRATION-1.2.0.md) — pré-vol `scripts/smoke-orchestration-preflight.ps1` | 🔧 |

**Done P3** : `DROX_ORCHESTRATION=v1_2` réussit : « ajoute un commentaire dans README » (direct) et « corrige typo dans A et B » (2 objectifs).

---

## 7. P4 — Chefs, récursion, parallèle

**Alignement vision** : §2.3, §3 arborescence, §4 parallélisation.

| Id | Tâche | Détail | Statut |
|----|-------|--------|--------|
| P4-1 | Rôle **Chef** (`conductor`) + `RunSpec` intermédiaire | entre Architecte et exécutant | ⬜ |
| P4-2 | Re-découpe : chef produit sous-`RunPlan` | récursion profondeur max configurable | ⬜ |
| P4-3 | Synthèse remontante : parent reçoit `RunResult.summary` pas transcript brut | orchestration | ⬜ |
| P4-4 | Parallèle : objectifs **disjoints** dans une séquence (tokio / jobs) | respecter `maxConcurrent` VRAM | ⬜ |
| P4-5 | Generaliser `subagent` / `task` → worker B sous contrôle C | `subagent.rs` refactor | ⬜ |
| P4-6 | Gates / phases / nudges **par rôle** (extraire de `agent/gates.rs`) | couche C uniquement | ⬜ |
| P4-7 | Tests : arbre 3 niveaux mock ; annulation cascade `parent_run_id` | | ⬜ |

**Done P4** : tâche multi-fichiers multi-dossiers avec chef ; 2 explores parallèles sur périmètres disjoints sans OOM documenté.

---

## 8. P5 — Décommission profils 0.0.0

| Id | Tâche | Statut |
|----|-------|--------|
| P5-1 | Défaut produit : `orchestrationMode=v1_2` (ou setting Nexus) | ⬜ |
| P5-2 | `modelTier` : déprécié, alias documenté vers mapping rôles | ⬜ |
| P5-3 | Retirer chemin `RunProfileId` du hot path (garder 1 release alias) | ⬜ |
| P5-4 | Archiver plans 0.0.0 tiers dans README ; pointer 1.2.0 | `docs/README.md` | ⬜ |
| P5-5 | Patchnote 1.2.0 | `operations/PATCHNOTE-1.2.0.md` | ⬜ |

**Done P5** : nouveau utilisateur ne voit plus Low/Medium comme axe principal ; doc à jour.

---

## 9. PI — Piste IDE (parallèle P2+)

| Id | Tâche | Fichier / zone | Statut |
|----|-------|----------------|--------|
| PI-1 | [PLAN-IDE-1.2.0.md](../10-ide/PLAN-IDE-1.2.0.md) rédigé | settings, composer | ✅ |
| PI-2 | Settings `nexus.drox.orchestration.*` (mode, modèles par rôle) | `droxConfiguration.ts` | ✅ |
| PI-3 | `buildAgentRunParams` envoie `orchestrationMode` | `droxRunSettings` / bridge | ✅ |
| PI-4 | UI : fil linéaire + rôles + vignettes modèle | `07b-runTimeline.js`, role-model vignettes | ✅ |
| PI-5 | Smoke chat après P3 | manuel (P3-9) | 🔧 |

---

## 10. Fichiers moteur — carte de migration

Référence rapide lors des PR (détail dans [PLAN-CONSTRUCTION §3](../02-construction/PLAN-CONSTRUCTION-MOTEUR-1.2.0.md)).

| Fichier actuel | Phase | Action |
|----------------|-------|--------|
| `run_profile/policy.rs` | P1→P5 | Remplacé par `RunSpec` + mapping legacy |
| `agent/loop.rs`, `agent_stream.rs` | P1 | Entrée `RunSpec` uniquement |
| `agent/nudges.rs`, `gates.rs`, `phases.rs` | P4 | Déplacer vers `orchestration/` |
| `subagent.rs` | P4 | Worker B, orchestration C |
| `drox-cli/.../handlers/agent.rs` | P2–P3 | Route legacy / v1_2 |
| `drox-tools/src/simple/task.rs` | P4 | S’aligne sur exécutant, pas sur architecte |

**Nouveau (cible)** :

```text
drox-engine/src/
  run_spec/          # P1 — contrat B
  orchestration/     # P2+ — couche C
    mod.rs           # OrchestrationMode, prepare_run_spec (P2 ✅)
    architect.rs     # P3
    conductor.rs     # P4
    executor.rs      # P3
    sequences.rs     # P3–P4
    synthesize.rs    # P3–P4
```

---

## 11. Validation / smoke par phase

| Phase | Commande | Attendu |
|-------|----------|---------|
| Chaque PR | `cargo test --workspace` | vert |
| Chaque PR | `.\scripts\test-drox.ps1` | vert |
| P2+ | `DROX_ORCHESTRATION=legacy` + smoke RPC | identique pré-1.2.0 |
| P3+ | `DROX_ORCHESTRATION=v1_2` + [SMOKE-ORCHESTRATION-1.2.0.md](../11-operations/SMOKE-ORCHESTRATION-1.2.0.md) | scénarios 1–3 |
| PI | `.\scripts\code.bat` + chat Drox | stream + tools |

---

## 12. Journal

| Date | Jalon | Note |
|------|-------|------|
| 2026-05-20 | Plan créé | Suite vision + construction ; upstream 1.122 compile OK |
| 2026-05-20 | P0 brouillons | SPEC ×3 + smoke + PLAN-IDE créés |
| 2026-05-20 | P1 démarré | `RunSpec` + `AgentConfig.run_spec` |
| 2026-05-20 | **P1 bouclé** | `RunSpec` autorité exécution |
| 2026-05-20 | **P2** | `orchestration/`, `DROX_ORCHESTRATION`, `orchestrationMode` RPC |
| 2026-05-20 | **P3 MVP** | `orchestration_run.rs`, rôles Architect/Executor, `RoleEnter`, synthèse |
| 2026-05-26 | **P3b** | Gates architecte, `partial`/`failed`, fil linéaire UI, verify → section `plan` |
| 2026-05-26 | **P3 pré-vol** | `scripts/smoke-orchestration-preflight.ps1` |
| | P3-9 smoke manuel | |
| | P4 | |
| | P5 doc | |

---

## 13. Prochaine action immédiate

1. `.\scripts\smoke-orchestration-preflight.ps1`
2. Smoke manuel scénarios **1–3** : [SMOKE-ORCHESTRATION-1.2.0.md](../11-operations/SMOKE-ORCHESTRATION-1.2.0.md)
3. Critères **chat1** : [VISION-CONSOLIDEE §6](../01-vision/VISION-CONSOLIDEE-1.2.0.md)
4. Ensuite **P4-1** (Chef / `conductor`)
