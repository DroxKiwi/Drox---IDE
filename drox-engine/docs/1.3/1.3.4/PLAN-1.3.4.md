# Plan 1.3.4 — Architecte seul (sub-agents désactivés)



**Version** : 1.3.4 · juin 2026  

**Base** : moteur 1.3.2 mergé (`role_split` — [CONDUCTEUR-CODE.md](../1.3.2/CONDUCTEUR-CODE.md))  

**Prérequis** : [1.3.3](../1.3.3/README.md) — installeur fiable, pipeline garde-fous



---



## Objectif release



| Priorité | Livrable |

|----------|----------|

| **P0** | Sub-agents **désactivés** (`delegate_executor` masqué) — architecte avec **tous les outils** workspace |

| **P0** | Code exécuteur / délégation **conservé** (réactivation via preset `custom`) |

| **P0** | Moteur **stable** : runs complets sans plantage silencieux, erreurs tool structurées |

| **P1** | `cargo test -p drox-engine` + `cargo test -p drox-cli` verts |

| **P1** | [TEST-PLAN solo](finalisation/TEST-PLAN-1.3.4-SOLO.md) signé (T1–T15, P8–P10, dogfood) |

| **P2** | Durcissement moteur optionnel (section H) — **uniquement** si dogfood l'exige |



**Hors scope 1.3.4** : onboarding, index RAG, graphe, fast path, shell live view, télémétrie → [1.4.1](../../1.4/1.4.1/PLAN-1.4.1.md).



**Hors scope 1.3.4 (UI polish)** : refonte visuelle chat, timeline, cartes tool, export, copy settings — **chantier séparé après stabilité moteur**, avant tag release (voir [Phase U](#phase-u--ui-avant-tag-release-hors-stabilisation-moteur)).



---



## Séquence recommandée



```text

Phase A (solo)     →  déjà livré en code (flags, prompts, reliquats)

Phase S (stabilité) →  tests auto + manuels + dogfood

Phase H (durcir)   →  petits diffs moteur si T1/T6/D2 échouent

Phase U (UI)       →  gros travail interface — après S (+ H si besoin)

CLOSURE + tag      →  1.3.4

```



---



## Phase A — Désactivation sub-agents (code conservé)



### A.1 Flag produit `executor_delegation_enabled`



- `EngineTuning` : **`false` par défaut** (tous presets `relaxed` / `normal` / `strict`).

- `RunSpec` : masque `delegate_executor` dans `tool_visible` quand `false`.

- `orchestration_run` : ne monte pas `OrchestrationDelegateWireInput` quand désactivé.



### A.2 Prompts & nudges solo



- Noyau edit `01_core_solo.md` (pas de mention `delegate_executor`).

- Protocoles outil : variantes `*_solo.md` + `tool_block_dual`.

- Nudges délégation ignorés ; sanity / no-work / snapshot / checkpoint en variantes solo.

- `architect_help` : guidance solo (`bash` pour sanity, pas de topics `delegate`/`verify`).

- Matrice complète : [RELIQUATS-ARCHITECTE-SEUL.md](RELIQUATS-ARCHITECTE-SEUL.md).



### A.3 UI IDE (masquage minimal — fonctionnel, pas polish)



- Vignette **Executor** absente du composer chat.

- Réglages Drox masqués : `drox.executor.model`, `drox.orchestration.maxParallelExecutors`, `drox.subagents.*`, tuning délégation (`drox.engine.tuning.*` exécuteur).

- Flag produit : `DROX_EXECUTOR_DELEGATION_UI_ENABLED` dans `droxOrchestrationUi.ts`.

- Correctifs stabilité déjà livrés : RPC `subagentsNumCtx` (pas de booléen), dépendance circulaire `droxOrchestrationUi`, garde `droxConfiguration` props.



### A.4 Réactivation (dev / dogfood)



Preset **`custom`** + override RPC :



```json

{

  "engineStrictness": "custom",

  "engineTuning": { "executorDelegationEnabled": true }

}

```



IDE : `DROX_EXECUTOR_DELEGATION_UI_ENABLED = true` dans `droxOrchestrationUi.ts` + rebuild.



---



## Phase S — Stabilisation moteur



Objectif : **prouver** que l'état actuel fonctionne — pas d'enrichissement produit.



### S.1 Binaire & pipeline



- [ ] `cargo build -p drox-cli` + Reload Window

- [ ] `drox.executablePath` → `target\debug\drox.exe` (ou release)

- [ ] `.\scripts\verify-drox-engine.ps1` → MODERN, `role_split`, pas de gate chain

- [ ] Log **Output → Drox Engine** : `pipeline=role_split`



### S.2 Tests manuels — [TEST-PLAN-1.3.4-SOLO.md](finalisation/TEST-PLAN-1.3.4-SOLO.md)



| Bloc | Contenu |

|------|---------|

| **§1 Routage** | T1–T4 (salut, discussion, edit, avis) |

| **§2 Gates** | T5–T8 (done/todos, erreurs tool sans crash run) |

| **§3 Edit smoke** | T9–T11 (read/edit, `bash`, cycle sanity solo) |

| **§4 Permissions** | T12–T15 (`analyze` / `trustEdit` / `imNotCrazy`) |

| **§6 Presets** | P8–P10 ([VALIDATION-PRESETS](../1.3.2/finalisation/VALIDATION-PRESETS-ENGINE-1.3.2.md)) |

| **§8 Dogfood** | D1–D3 (2–3 sessions réelles, pas d'échec silencieux) |



**Retiré vs TEST-PLAN 1.3.2** : scénarios T5–T6/T9–T10 centrés `delegate_executor` et exécuteur parallèle.



### S.3 Tests automatisés



```powershell

cd drox-engine\drox

cargo test -p drox-engine

cargo test -p drox-cli

```



```powershell

# Racine repo — nécessite out/ compilé

npm run test-node -- --run "vs/workbench/contrib/drox/test/common/"

```



### S.4 Parcours RPC critique (non-régression)



- [ ] `agent.run` démarre et termine (`agent/done`) sur message de travail

- [ ] Params IDE : `orchestrationMode: role_split`, `orchestrationMaxParallelExecutors: 1`, pas de champs executor omis mal typés

- [ ] Modes permission transmis : `mode: analyze | trustEdit | imNotCrazy`

- [ ] Erreur moteur visible dans le chat (pas d'arrêt `busy` sans message)



### S.5 Critères moteur « stable »



- [ ] T1–T4 + T9–T11 OK sur binaire frais

- [ ] T12–T15 OK (permissions)

- [ ] `cargo test -p drox-engine` vert (243+ tests)

- [ ] Dogfood D1–D2 OK



---



## Phase H — Durcissement moteur (optionnel, petits diffs)



**Règle** : implémenter **seulement** si un cas du TEST-PLAN ou du dogfood échoue. Pas de feature nouvelle.



| # | Sujet | Déclencheur | Piste |

|---|--------|-------------|-------|

| **H1** | Outils sur salut (discussion reply-only) | T1 échoue : `memory_list` / `workspace_map_read` sur « Salut » ([chat.txt](../chat.txt)) | Gate pré-exécution : bloquer les outils quand `StartRunKind::DiscussReplyOnly` |

| **H2** | Erreurs tool vs fin de run | T7–T8 : `RunOutcome::Errored` opaque | Vérifier que tool errors remontent en JSON sans tuer le run |

| **H3** | Sanity cycle `bash` | T11 : sanity bloque `[phase: done]` à tort | Ajuster `cycle_sanity.rs` / snapshot solo |

| **H4** | Logs diagnostic | D2 : échec silencieux | Tracer `agent.run failed` + cause dans Sortie moteur |



---



## Phase U — UI avant tag release (hors stabilisation moteur)



À planifier **après** Phase S (+ H si nécessaire). Non bloquant pour signe moteur, **bloquant** pour perception produit 1.3.4.



| Thème | Exemples |

|-------|----------|

| Chat / timeline | Cartes tool, thinking, fin de run, erreurs gates |

| Composer | Vignettes permission, libellés, sync settings |

| Export / replay | Footer sans `delegate_executor`, relecture solo |

| Settings | Descriptions sans jargon exécuteur quand UI solo |

| Shell | Préparation [idée 15](../../feature-brainstorm/15-shell-live-view.md) — post-1.3.4 ou fin de Phase U |



---



## Critère « 1.3.4 livrée »



### Moteur (obligatoire)



- [ ] Phase A validée ([RELIQUATS](RELIQUATS-ARCHITECTE-SEUL.md))

- [ ] Phase S complète ([TEST-PLAN solo](finalisation/TEST-PLAN-1.3.4-SOLO.md))

- [ ] `cargo test -p drox-engine` + `cargo test -p drox-cli` verts

- [ ] [CLOSURE-1.3.4.md](finalisation/CLOSURE-1.3.4.md) signée



### Produit (avant tag public)



- [ ] Phase U — UI « correcte » (pas de polish infini — périmètre à figer en début de Phase U)

- [ ] Version `droxVersion` 1.3.4 bumpée



---



## Suite (1.4.0 · 1.4.1)



**1.3.4 clôturée anticipément** — voir [CLOSURE](finalisation/CLOSURE-1.3.4.md).



### 1.4.0 — Run Rail (priorité conducteur)



[Hub](../../1.4/1.4.0/README.md) · [OPENING](../../1.4/1.4.0/finalisation/OPENING-1.4.0.md)



| Sujet | Doc |

|-------|-----|

| Vision + mode A | [01-VISION](../../1.4/1.4.0/01-VISION.md) |

| hold / advance | [02-RAIL-PROTOCOL](../../1.4/1.4.0/02-RAIL-PROTOCOL.md) |

| Modules Rust | [05-CODE-ARCHITECTURE](../../1.4/1.4.0/05-CODE-ARCHITECTURE.md) |

| Phases | [07-IMPLEMENTATION-PHASES](../../1.4/1.4.0/07-IMPLEMENTATION-PHASES.md) |



### 1.4.1 — Index & contexte (ex-1.3.5)



[PLAN-1.4.1.md](../../1.4/1.4.1/PLAN-1.4.1.md) — complète le rail (inject READ boot).



---



## Liens



- [README 1.3.4](README.md)

- [TEST-PLAN solo](finalisation/TEST-PLAN-1.3.4-SOLO.md)

- [CLOSURE](finalisation/CLOSURE-1.3.4.md)

- [RELIQUATS](RELIQUATS-ARCHITECTE-SEUL.md)

- [Hub 1.3](../README.md)

