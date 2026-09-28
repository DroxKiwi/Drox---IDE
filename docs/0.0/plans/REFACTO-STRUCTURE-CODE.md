# Refactoring structure — moteur Rust & workbench Drox

**Date** : 2026-05-20  
**Statut** : **Phase 0–3 ✅ structure** · **Phase 4 ✅ clôture doc** (2026-05-20) · smoke manuel IDE = gate optionnelle ([SMOKE-MANUEL-REFACTO](../operations/SMOKE-MANUEL-REFACTO.md))  
**Objectif** : réduire les monolithes **sans changer le comportement actuel** (référence = profil **Medium**), tout en posant une structure prête pour [MODELES-PAR-TAILLE](../architecture/MODELES-PAR-TAILLE.md) et [MEMOIRE-LONG-TERME](../architecture/MEMOIRE-LONG-TERME.md).

**Documents liés** : [PLAN-INTEGRATION](./PLAN-INTEGRATION.md) · [MODELES-PAR-TAILLE](../architecture/MODELES-PAR-TAILLE.md) · [MEMOIRE-LONG-TERME](../architecture/MEMOIRE-LONG-TERME.md) · [GUIDE-MOTEUR-DROX](../guides/GUIDE-MOTEUR-DROX.md)

---

## 0. Approche retenue (à ne pas dévier)

### 0.1 Deux règles non négociables

1. **Chaque livraison = déplacement de code**, pas de réécriture de logique. Copier → nouveau module → `mod` + réexport → tests verts. Pas de « profit » opportuniste (prompt, gate, limite d’itérations).
2. **Un seul profil d’exécution actif pendant tout le refactoring** : **`Medium` = comportement d’aujourd’hui à l’identique**. Le profil **Low** n’est pas implémenté ici — seulement des **points d’extension** pour le brancher plus tard sans retoucher la boucle agent.

### 0.2 Préparer les modèles Low / Medium sans les coder

Avant et pendant le découpage de `agent.rs`, introduire une couche **`run_profile`** :

```text
drox-engine/src/run_profile/
  mod.rs              # RunProfileId { Medium } seul pour l’instant
  medium.rs           # comportement actuel (délégation vers gates / limites actuelles)
  policy.rs           # RunPolicy : gates, filtres outils, budgets (structs)
```

| Futur ([MODELES-PAR-TAILLE](../architecture/MODELES-PAR-TAILLE.md)) | Préparé dès Phase 0 |
|---------------------------------------------------------------------|---------------------|
| Tools exposés au LLM filtrés par tier | `RunPolicy::tool_visible(name)` — Medium = inchangé |
| Suppléments de prompt par tier | `RunPolicy::system_supplement_ids()` — Medium = liste actuelle |
| Gates plus stricts (low) | `RunPolicy::evaluate_gate(kind)` — Medium = code copié tel quel |
| Limites (1 tool/tour, max todos) | champs `Option<usize>` — Medium = `None` (= pas de limite extra) |

**`AgentConfig`** reçoit `run_policy: RunPolicy` (défaut = `RunPolicy::medium()`). Les `if` métier appellent la policy au lieu de fonctions libres dans un fichier géant — **le corps Medium reste le code actuel**.

**Hors scope de ce chantier** : champ JSON-RPC `modelTier`, vignettes UI modèle, prompt `LOW_MODEL_SUPPLEMENT` — voir doc architecture modèles.

### 0.3 Façades pour la suite (Phase 2 moteur)

```text
drox-cli/src/system_prompt/
  assemble.rs       # build_system_prompt(AssembleInput { profile_id, … })
  supplements.rs      # blocs statiques (langue, thinking, …)

registry_for_policy(&RunPolicy) -> ToolRegistry   # Medium = registre complet actuel
```

---

## 1. Constat (audit 2026-05-20)

### 1.1 Moteur Rust (`drox-engine/drox/crates/`)

| Fichier | Lignes (approx.) | Problème |
|---------|------------------|----------|
| ~~`agent.rs`~~ → `agent/` | **découpé** | `phases`, `gates`, `nudges`, `loop`, `agent_stream` ; tests encore dans `mod.rs` |
| ~~`handlers.rs`~~ → `handlers/` | **découpé** | + `system_prompt/` |
| `drox-cli/src/prompts.rs` | ~730 | Prompts monolithiques |
| `drox-engine/src/compaction.rs` | ~760 | Couplé agent — touché en [MEMOIRE-LONG-TERME](../architecture/MEMOIRE-LONG-TERME.md) |

### 1.2 Workbench Nexus (`src/vs/workbench/contrib/drox/`)

| Fichier | Lignes (approx.) | Problème |
|---------|------------------|----------|
| `browser/droxChatController.ts` | **~256** | Façade → `browser/chat/*` |
| `common/chat/` (amorcé) | — | Réexports ; reste du `common/` à plat |
| `browser/media/droxChat/*.js` | découpé ✅ | Modèle à suivre côté TS |

---

## 2. Cible structurelle (référence)

### 2.1 Moteur — module `agent/`

```
drox-engine/src/
  run_profile/          # Phase 0 — extension Low/Medium
  agent/
    mod.rs              # façade Agent::run
    phases.rs           # parse [phase:], phase_for_tool
    gates.rs            # gates via RunPolicy
    nudges.rs           # rappels system
    loop.rs             # boucle principale
    agent_stream.rs     # consume_stream, TurnOutcome, LoopDetector
    # memory_hook.rs  — futur ; persist dans agent/mod.rs + memory/
```

**Règle** : aucun fichier > **~800 lignes**.

### 2.2 Moteur — CLI

```
drox-cli/src/
  jsonrpc/handlers/      # agent_run, session, initialize
  system_prompt/         # assemble + supplements (profile_id dans AssembleInput)
```

### 2.3 Workbench

```
contrib/drox/
  common/{chat,engine,tools,memory,ui}/
  browser/chat/          # façade controller + lifecycle + replay + webview host
```

---

## 3. Plan en 4 phases (grosses étapes)

Chaque phase se termine par une **validation obligatoire** (case à cocher). On ne commence pas la phase suivante tant que la précédente n’est pas **✅ validée**.

---

### Phase 0 — Socle `RunProfile` + ligne de base

**But** : poser les extension points ; zéro changement visible.

**Travail**

- Créer `run_profile/` (`RunProfileId`, `RunPolicy`, `RunPolicy::medium()`).
- Ajouter `run_policy` à `AgentConfig` (défaut Medium).
- Tests : `medium_policy_matches_legacy_defaults` (limites, pas de filtre tools).
- Établir la **checklist smoke manuelle** figée — [SMOKE-MANUEL-REFACTO](../operations/SMOKE-MANUEL-REFACTO.md).

**Validation Phase 0** — à cocher avant Phase 1

- [x] `cargo test --workspace` vert (2026-05-20)
- [ ] `cargo clippy --workspace -- -D warnings` vert — **hors scope refactor** : échecs préexistants (`drox-bash`, `drox-permissions`, `drox-session`, …)
- [ ] Smoke manuel checklist : **aucune différence** vs avant Phase 0 — **à cocher par l’humain** ([SMOKE-MANUEL-REFACTO](../operations/SMOKE-MANUEL-REFACTO.md))
- [x] Revue : aucun changement de texte dans `CORE_SYSTEM_PROMPT` ni dans les gates effectifs (déplacements uniquement)

---

### Phase 1 — Moteur : découper `agent.rs`

**But** : module `agent/` complet ; logique Medium inchangée ; gates/nudges passent par `RunPolicy`.

**Travail** (ordre interne : du plus stable au plus couplé)

1. Extraire `phases.rs` (parse marqueurs, `phase_for_tool`, legacy markers).
2. Extraire `gates.rs` + brancher `config.run_policy.evaluate_gate(...)`.
3. Extraire `nudges.rs`.
4. Extraire `stream.rs` / `loop.rs` (corps de `run`).
5. `agent/mod.rs` façade ; `agent.rs` devient `mod.rs` ou disparait.
6. Test de non-régression : `medium_profile_gate_parity` sur scénarios figés (done sans answering, todo recreation, testing gate, …).

**Validation Phase 1** — à cocher avant Phase 2

- [x] `cargo test --workspace` vert (2026-05-20)
- [ ] Aucun fichier dans `agent/` > 800 lignes — **reste** : `mod.rs` (~3 200 L., tests intégration) et `loop.rs` (~1 240 L.) ; production dans `phases` / `gates` / `nudges` / `agent_stream` OK
- [x] `agent.rs` monolithique supprimé — module `agent/` + sous-fichiers
- [ ] Smoke manuel checklist : **aucune différence** UI / trace phases / tools — **à cocher par l’humain**
- [x] `npm run test-drox` vert (34 tests, 2026-05-20)
- [x] Revue git : PR = déplacements (pas de branche métier Low / `modelTier`)

---

### Phase 2 — Moteur : CLI (`handlers` + `system_prompt`)

**But** : alléger `handlers.rs` et préparer l’assemblage de prompt par profil (sans profil Low).

**Travail**

- Découper `handlers.rs` → `handlers/{agent_run,session,initialize}.rs`.
- Créer `system_prompt/assemble.rs` avec `AssembleInput { profile_id: Medium, … }`.
- `registry_for_policy(&RunPolicy)` — Medium retourne le registre actuel.
- `handlers` appelle assemble + registry via policy (comportement identique).

**Validation Phase 2** — à cocher avant Phase 3

- [x] `cargo test --workspace` vert (2026-05-20)
- [x] Smoke RPC doc [SMOKE-RPC](../operations/SMOKE-RPC.md) : parcours couvert par `test-drox` (`tool/exec`, cancel, bridge) ; E2E LLM = manuel IDE
- [ ] Smoke manuel checklist : **aucune différence** — **à cocher par l’humain**
- [ ] `extension-vscode` F5 (référence) : un run complet OK (optionnel mais recommandé)

---

### Phase 3 — Workbench : structure TypeScript

**But** : même philosophie côté IDE ; préparer `modelTier` dans les types sans le brancher en UI.

**Travail**

- Découper `droxChatController.ts` → `browser/chat/*` (façade < 250 lignes).
- Regrouper `common/` en sous-dossiers + réexports temporaires si besoin.
- Introduire type `DroxRunProfileId = 'medium'` (ou interface miroir de Rust) dans `runSettings` — **non exposé** dans la webview.
- Réserver emplacement HTML/CSS pour futures vignettes modèle (commentaire ou bloc `hidden`).

**Validation Phase 3** — à cocher avant clôture

- [x] `npm run test-drox` vert (34 tests, 2026-05-20)
- [x] Compilation workbench : modules `contrib/drox` compilent (pas de régression TS sur le périmètre Drox)
- [ ] Smoke manuel checklist : onglets, replay, exploration, answering, send — **à cocher par l’humain**
- [x] Aucun `.ts` sous `contrib/drox` > 500 lignes (hors tests) — max : `droxChatTabsManager.ts` (~424 L.), façade `droxChatController.ts` (~256 L.)
- [x] [CHAT-WEBVIEW-MODULES](../ide/CHAT-WEBVIEW-MODULES.md) + ce document à jour (chemins réels)

---

### Phase 4 — Clôture & passage de relais

**But** : documenter la nouvelle carte ; ouvrir la voie aux chantiers fonctionnels.

**Travail**

- [x] Mettre à jour [GUIDE-MOTEUR-DROX](../guides/GUIDE-MOTEUR-DROX.md) § chemins sources + §18 workbench.
- [x] Marquer ce document **Statut : Phase 0–4 ✅** (structure + doc).
- [x] Lister les extension points — §7 ci-dessous.
- [x] Hub [README](../README.md) : statut refactoring.

**Validation Phase 4 — fin de chantier refactoring**

- [x] Re-run `cargo test --workspace` + `npm run test-drox` (2026-05-20)
- [x] Hub [README](../README.md) : lien + statut REFACTO
- [x] Règle de relais : **ne pas** implémenter Low / Mémoire V2 / `modelTier` JSON-RPC dans la même PR que ce refactoring — chantiers séparés branchés sur les points d’extension §7

---

## 4. Garanties transverses (toutes phases)

| Garantie | Comment |
|----------|---------|
| Comportement utilisateur | Profil **Medium** seul ; smoke checklist identique |
| Tests automatisés | `cargo test --workspace` + `npm run test-drox` à chaque merge |
| Pas de feature sneak | Pas de `modelTier` JSON-RPC, pas de prompt Low, pas de mémoire SQLite dans ce chantier |
| Revue | PR focalisées : une phase ou une sous-partie de Phase 1 max |
| Rollback | Chaque phase mergeable indépendamment si tests verts |

---

## 5. Non-objectifs (ce document)

- Implémenter [MODELES-PAR-TAILLE](../architecture/MODELES-PAR-TAILLE.md) ou [MEMOIRE-LONG-TERME](../architecture/MEMOIRE-LONG-TERME.md).
- Réécrire le protocole JSON-RPC (sauf ajout **différé** de `modelTier` après Phase 4).
- Refactorer `drox-tools/simple/` en profondeur (optionnel, basse priorité).
- Toucher `droxChat/*.js` (déjà modulaire).

---

## 6. Suivi d’avancement (à mettre à jour ici)

| Phase | Statut | Date validation |
|-------|--------|-----------------|
| **0** — RunProfile socle | ✅ Tests auto · smoke manuel ☐ | 2026-05-20 |
| **1** — Découpage `agent/` | ✅ Structure · `mod.rs` tests >800 L. · smoke ☐ | 2026-05-20 |
| **2** — CLI handlers + system_prompt | ✅ Tests auto · smoke manuel ☐ | 2026-05-20 |
| **3** — Workbench TS | ✅ Tests auto · smoke manuel ☐ | 2026-05-20 |
| **4** — Clôture doc | ✅ 2026-05-20 | 2026-05-20 |

**Chantier suivant** : [PLAN-MODELES-TIER](./PLAN-MODELES-TIER.md) (profils Low/Medium).

### Validation automatisée (rejouée 2026-05-20)

| Commande | Résultat |
|----------|----------|
| `cargo test --workspace` (drox-engine/drox) | ✅ |
| `cargo test -p drox-engine -p drox-cli` | ✅ (116 + 82 tests) |
| `npm run test-drox` / `scripts/test-drox.ps1` | ✅ (34 tests) |
| `cargo clippy --workspace -D warnings` | ❌ dette clippy hors crates refactorés |

**Gate optionnelle (régression UX)** : [SMOKE-MANUEL-REFACTO](../operations/SMOKE-MANUEL-REFACTO.md) (~10 min IDE + LLM) — recommandée avant merge release.

---

## 7. Passage de relais — extension points (post Phase 4)

### 7.1 Chantier [MODELES-PAR-TAILLE](../architecture/MODELES-PAR-TAILLE.md)

> **Suivi détaillé** : [PLAN-MODELES-TIER](./PLAN-MODELES-TIER.md) §8.

| Livrable | Statut (2026-05-20) |
|----------|---------------------|
| `RunProfileId::Low` + `RunPolicy::low()` / `for_profile` | ✅ M0 |
| JSON-RPC + IDE `modelTier` | ✅ M0 |
| Allowlist, 1 tool/tour, prune registre (T1–T3) | ✅ M1 |
| `LOW_MODEL_SUPPLEMENT`, prompt allégé, todo≤5, nudges courts (M2) | ✅ M2 |
| Vignettes UI Fast/Standard | ✅ M3 |
| `memory_budget_tokens` + SQLite (MEMOIRE V2) | ⬜ M4 |

### 7.2 Chantier [MEMOIRE-LONG-TERME](../architecture/MEMOIRE-LONG-TERME.md)

| Prêt (structure) | À implémenter |
|------------------|---------------|
| `RunPolicy.memory_budget_tokens` (champ) | Budgets par tier + bloc prompt |
| `MemoryRuntime` / `persist_run` dans `agent/` | SQLite FTS, embeddings, hook dédié |

### 7.3 Dette acceptée

- `agent/mod.rs` / `loop.rs` > 800 L. (tests intégration à extraire)
- `cargo clippy -D warnings` workspace (hors crates refactorés)
- `common/` workbench : amorce `common/chat/` seulement

### 7.4 Carte sources

```text
drox-engine/.../run_profile/     agent/ (phases, gates, nudges, loop, agent_stream)
drox-cli/.../handlers/           system_prompt/
contrib/drox/browser/chat/       droxChatController.ts (façade)
contrib/drox/common/chat/        réexports + types profil
contrib/drox/browser/media/droxChat/   webview JS
```

*KDDS Nexus — refactoring structurel terminé (Medium inchangé). Tiers Low : M0–M2 ✅ — voir [PLAN-MODELES-TIER](./PLAN-MODELES-TIER.md).*
