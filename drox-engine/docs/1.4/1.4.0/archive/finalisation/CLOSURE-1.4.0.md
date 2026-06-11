# Clôture 1.4.0 — Refonte run rail (deuxième édition)

**Version** : `droxVersion` **1.4.0** (squelette code)  
**Statut** : **clôturé — juin 2026**  
**Décision** : squelette moteur **suffisant** ; stabilisation produit → **[1.4.1](../../1.4.1/README.md)**

---

## Verdict

La refonte **1.4.0** (FOI-REFONTE) est **figée** :

- Un conducteur : **run rail** (stations, pre_gate, snapshot, stall ACT).
- Un chemin edit : **Architect** + `01_core_rail_solo.md`.
- Un chemin discuss : **ArchitectDiscussion**.
- Reliquats retirés du chemin IDE : Executor, `delegate_executor`, segments ACT, Professor, Standard CLI, LoopDetector 1.3, prompts multiples.
- Boucle agent **splittée** (`loop/drive/`, `rail/`, `gates/`, `state/`, `stream/`, tests fragmentés).
- **201** tests `drox-engine` verts ; dogfood Qwen 27b : runs rapides et structurés (rail visible, pas de régression 1.3 flagrante).

**Non-objectif atteint** : produit utilisable en prod. Le moteur reste **globalement inutilisable** côté utilisateur final tant que **1.4.1** (bugs session/busy/discuss/boucles) et **1.4.2** (UI chat) ne sont pas livrés.

→ Avertissement public : [README racine](../../../../../../README.md#statut-produit).

---

## Livrables code

| # | Livrable | Statut |
|---|----------|--------|
| Phase 0–2 | Suppressions reliquats + UI fork P0 (executor/delegate) | ✅ |
| Phase 3 | Split `drive`, `state`, `gates`, `stream`, nudges, tests | ✅ |
| Phase 4 | Rail interne (pre_gate action, infer, tool specs act) | ✅ |
| Phase 5 | Dogfood manuel T1–T3 (échantillon juin 2026) | ✅ partiel — suffisant pour clôture squelette |
| Phase 6 | CLOSURE + README statut | ✅ |

---

## Reporté — ne pas rouvrir sur 1.4.0

| Version | Périmètre |
|---------|-----------|
| **[1.4.1](../../1.4.1/README.md)** | M-DISC-01, B-UI-07, B-UI-06, B-MOTOR-01/02/03 — [PLAN-1.4.1](../../1.4.1/PLAN-1.4.1.md) |
| **[1.4.2](../../1.4.2/README.md)** | Polish UI chat (plan sticky, thinking, trays, blocs rail) |
| **[1.4.3](../../1.4.3/PLAN-1.4.3.md)** | Index local, graphe, fast path |

**Règle** : pas de nouvelle refonte moteur sur la branche 1.4.0 ; patches **uniquement** via 1.4.1+.

---

## Sign-off clôture squelette

- [x] Refonte FOI phases 3–4 livrées ; dogfood rail satisfaisant
- [x] `cargo test -p drox-engine` vert
- [x] README racine : statut **non utilisable en prod** + renvoi 1.4.1
- [ ] Tag release installeur **1.4.0** public — **non** (squelette dev seulement)
- [ ] 09-TEST-PLAN signé intégral — reporté ; critères prod en 1.4.1

---

## Liens

- [FOI-REFONTE](../../FOI-REFONTE.md)
- [SMOKE-BACKLOG](../SMOKE-BACKLOG.md)
- [PLAN-1.4.1](../../1.4.1/PLAN-1.4.1.md)

---

*Clôture squelette — juin 2026 — branche `1.4.0` → merge `main` puis travail `1.4.1`.*
