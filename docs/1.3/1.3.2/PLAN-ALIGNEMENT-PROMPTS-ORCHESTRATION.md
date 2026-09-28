# Plan d’implémentation — alignement prompts, orchestration, UI (1.3.2)

> **OBSOLÈTE** — Plan 4 axes initial **hors périmètre** 1.3.2 stabilisée. Référence : [README.md](README.md) · [CLOSURE-1.3.2.md](finalisation/CLOSURE-1.3.2.md).

**Date** : 2026-06-02  
**Statut** : 🔄 en cours (phase 0 validée, phase 1 A1 partiellement livré)  
**Liens** : [README.md](README.md) · [PATCHNOTES-1.3.2.md](PATCHNOTES-1.3.2.md) · [CIRCUIT-MOTEUR-GATES-NUDGES.md](CIRCUIT-MOTEUR-GATES-NUDGES.md) · [07-reponses-legere](../../../feature-brainstorm/07-reponses-legere-sans-plan.md)

---

## Objectifs (5 chantiers demandés)

| # | Demande | Résultat attendu |
|---|---------|------------------|
| **A** | Tous les **system prompts injectés au modèle** en **anglais** | `prompts.rs`, prompts orchestration, suppléments moteur (`nudges` = messages `system` aussi en anglais — déjà le cas en grande partie) |
| **B** | Remplacer l’identifiant historique **`v1_2`** | Nom **mécanique** partagé Rust + IDE + RPC + docs 1.3.2 |
| **C** | Supprimer le **code mort** et aligner la **méthode** (intention > pédagogie) | Plus de « si l’utilisateur dit analyse… » dans les prompts ; protocole marqueurs + gates structurelles |
| **D** | Trancher **`RoleId::Standard`** | Pas de double vérité avec l’orchestration chat ; suppression ou périmètre explicite minimal |
| **E** | Brancher à l’**UI** ce qui existe déjà en RPC | `architectInteractionMode` ; documenter `orchestrationMode` renommé |

**Hors scope immédiat (mentionné pour la suite)** : paramètres produit `drox.engine.strictness` (allowlist / gates configurables) — prévoir des **points d’extension** dans ce plan, pas l’implémentation complète.

**Chantier F (1.3.2)** : prompts additifs — **plan d’exécution** [PLAN-PROMPTS-ADDITIFS-1.3.2.md](PLAN-PROMPTS-ADDITIFS-1.3.2.md) · design [PROMPTS-ADDITIFS-1.3.2.md](PROMPTS-ADDITIFS-1.3.2.md). Phase 0 partielle livrée (arborescence + `PromptVars`) ; runtime palier + snapshot : phases 1–2 du plan.

---

## Principes directeurs

1. **Langue utilisateur ≠ langue des prompts moteur**  
   - **Prompts `system`** (rôle, protocole, gates décrites au modèle) : **anglais uniquement**.  
   - **Langue de réponse** : toujours via `DROX_PRIMARY_LANGUAGE` / `merge_into_system` (`language.rs`) — instruction du type *« In `[phase: answering]`, write in {display}; internal phases in English »* — **aussi en anglais** dans le texte d’instruction.

2. **Intention déclarée, pas NLP sur le message user**  
   - Déjà en place sur le chat prod : `[gate: …]`, `[mode: …]`, `[task: meta]`, `task_id: sanity`, `[cycle: user_check]`.  
   - À **retirer des prompts** : listes d’exemples du type « quand l’utilisateur demande une vue d’ensemble → analyzing ».

3. **Un seul pipeline chat produit**  
   - Aujourd’hui : `agent.run` → `drive_run_v1_2` uniquement (`agent_run.rs`).  
   - Le gros `CORE_SYSTEM_PROMPT` français **n’est pas** le chemin IDE chat.

---

## État des lieux (audit code — 2026-06-02)

### Chemin chat IDE (prod)

```
buildAgentRunParams → orchestrationMode: 'v1_2'
  → agent.run → drive_run_v1_2
    → ArchitectIntent | ArchitectDiscussion | Architect
    → prompts: orchestration/prompts/* (EN, sauf encodage legacy architect_edit)
```

- `architectInteractionMode` : **implémenté RPC**, **non envoyé** par `droxRunSettings.ts`.
- `subagentsEnabled` : **supprimé** côté IDE (cohérent).

### `prompts.rs` (drox-cli)

| Contenu | Langue | Encore utilisé ? |
|---------|--------|------------------|
| `CORE_SYSTEM_PROMPT` | **FR** (~800 lignes) | **CLI** `drox-cli/src/main.rs` (`RunSpec::for_standard_agent`) |
| `PROFESSOR_MODE_SUPPLEMENT` | FR | `assemble_standard` si `professor_mode` — **pas** le chemin orchestration IDE |
| `COMPACTION_PROMPT`, suppléments thinking / explore | FR / EN mixte | Standard + compaction |
| Tests `prompts.rs` | Assertions FR | À migrer EN |

### `RoleId::Standard` — pas totalement mort

| Appelant | Usage |
|----------|--------|
| `agent.run` (JSON-RPC) | **Non** — toujours orchestration |
| `drox-cli` REPL / one-shot (`main.rs`) | **Oui** — `for_standard_agent` |
| `assemble_system_prompt` | Branche `Standard` + tests |
| `build_registry_for_run` | MCP + `task` explore si Standard |
| `prepare_run_spec` | **Mort** (exporté, **jamais appelé**) |
| Nudges / gates `done` | Branches `RoleId::Standard` (professor, agent unique) |

**Conclusion D** : ne pas supprimer `Standard` sans décision sur le **CLI terminal** et le mode **Professor** (aujourd’hui prompt professor lié à `assemble_standard`, pas à l’orchestration).

### Renommage `v1_2` — surface à toucher

| Zone | Fichiers (non exhaustif) |
|------|---------------------------|
| Rust enum / wire | `orchestration/mod.rs`, `orchestration_run.rs` (`drive_run_v1_2` → `drive_role_split_run`) |
| RPC tests | `protocol.rs`, `agent_run.rs` |
| IDE | `droxRunSettings.ts`, `droxCommon.test.ts`, commentaires `droxConfiguration.ts`, `00-context.js` |
| Docs 1.3.2 | `CIRCUIT-MOTEUR-GATES-NUDGES.md`, `PATCHNOTES`, `JOURNAL`, brainstorm 07 |
| Docs 1.2 historiques | **Option** : bandeau « alias déprécié » seulement dans `parse()` — pas réécrire toute l’archive 1.2 |

---

## Proposition de nommage (chantier B)

**Recommandation** (mécanique, stable produit) :

| Avant | Après |
|-------|--------|
| `OrchestrationMode::V1_2` | `OrchestrationPipeline::RoleSplit` (ou module `role_split/`) |
| Wire RPC `orchestrationMode: "v1_2"` | `"role_split"` |
| `drive_run_v1_2` | `drive_role_split_run` |
| Logs `orchestration v1_2` | `orchestration pipeline=role_split` |

**Compatibilité** (1 release) :

- `OrchestrationMode::parse` accepte encore `v1_2`, `v1_3`, `1.2.0`, … → map vers `RoleSplit` + `tracing::warn!(deprecated)`.
- IDE envoie **`role_split`** uniquement.

**Alternative rejetée** : `architect_executor` (trop centré rôle, pas le tour intent/discuss).

---

## Plan par phases

### Phase 0 — Cadrage (½ j)

- [x] Valider le wire name : **`role_split`** (défaut plan ; alias `v1_2` en phase 2).
- [x] Décider **Standard** : **D1** — garder CLI + `core_standard.rs` EN ; chat prod reste orchestration seule.
- [ ] Créer entrée journal + ligne dans [CLOSURE-1.3.2.md](finalisation/CLOSURE-1.3.2.md).

---

### Phase 1 — Anglais des prompts injectés (chantier A)

**Règle** : tout texte concaténé dans `Message::system` pour le LLM = anglais. Les commentaires Rust et la doc équipe peuvent rester en français.

| Étape | Fichiers | Actions |
|-------|----------|---------|
| A1 | `drox-cli/src/prompts/core_standard.rs` | [x] `CORE_SYSTEM_PROMPT` EN ; choix phase par protocole (pas NLP user). |
| A2 | `prompts.rs` / `core_standard.rs` | [x] `PROFESSOR_MODE_SUPPLEMENT` EN ; [x] `COMPACTION_*`, `EXPLORATION_*`, `SUBAGENTS_*`, `NATIVE_THINKING_*` déjà EN. |
| A3 | `language.rs` | [x] `Language::system_instruction` EN (deux canaux). |
| A4 | `orchestration/prompts/*.rs` | [x] `architect_edit.rs` EN + UTF-8 ; autres fichiers déjà EN. |
| A5 | `agent/nudges/**` | [x] pas de chaînes prompt FR résiduelles (grep). |
| A6 | Tests | `prompts.rs` tests, snapshots : assertions EN. |

**Non objectif** : traduire la doc markdown française du repo.

**Critère d’acceptation A** : `rg -i "Tu es |rédigez|utilisateur demande" drox-engine/drox/crates --glob '*.rs'` ne matche plus les **chaînes prompt** (hors commentaires / messages d’erreur permissions FR si produit FR).

---

### Phase 2 — Renommage `v1_2` → `role_split` (chantier B)

- [x] B1–B3 Rust + IDE `droxRunSettings.ts` + tests `droxCommon` / `protocol`
- [x] B4 docs 1.3.2 `CIRCUIT-MOTEUR-GATES-NUDGES.md` (schéma principal)
- [ ] B5 `extension-vscode/package.json` si mention
- [ ] PATCHNOTES / JOURNAL / grep docs archive 1.2

| Étape | Actions |
|-------|---------|
| B1 | Rust : renommer enum, `as_str()`, `drive_*`, logs, tests `orchestration/mod.rs`. |
| B2 | Alias dépréciés dans `parse()` + test « v1_2 still parses ». |
| B3 | IDE : `orchestrationMode: 'role_split'` + tests. |
| B4 | Docs **1.3.2** : remplacer `v1_2` par `role_split` + glossaire une fois en tête de `CIRCUIT-MOTEUR-GATES-NUDGES.md`. |
| B5 | `extension-vscode/package.json` descriptions si mention `v1_2`. |

**Critère B** : build `drox-engine` + `drox-cli` ; tests IDE `droxCommon.test.ts` ; grep `v1_2` dans `src/vs/workbench/contrib/drox` = 0 (hors commentaires migration éventuels).

---

### Phase 3 — Alignement méthode + suppression mort (chantiers C + D)

- [x] **D1** documenté (`RoleId::Standard`, CIRCUIT §12) — CLI/professor conservés.
- [x] `prepare_run_spec` supprimé + export `lib.rs`.
- [x] Commentaires `v1_2` résiduels → `role_split` (config, delegate_executor).
- [x] §13 `engine.strictness` (stub doc) dans CIRCUIT.

#### 3.1 Prompts orchestration (déjà partiellement fait)

- [x] `architect_edit.rs` — EN, protocol markers, pas de NLP user.
- [x] `architect_intent.rs` / `architect_discussion.rs` — EN ; discuss sans outils ; intent gate only.
- [x] `architect_messages.rs` — EN, rappel `[mode: …]` sans playbook analyse user.

#### 3.2 Code mort confirmé à supprimer

| Élément | Preuve mort | Action |
|---------|-------------|--------|
| `prepare_run_spec` | Aucun appelant hors définition | [x] **Supprimé** + export `lib.rs` |
| `OrchestrationMode` avec un seul variant | Wire parse + alias dépréciés | [x] conservé (`RoleSplit` + `resolve`) |
| Branche `assemble` Standard pour chat | Jamais atteinte via `agent.run` | Garder si CLI/professor ; sinon déplacer |

#### 3.3 `RoleId::Standard` — options (décision phase 0)

**Option D1 — Minimal (recommandé court terme)**  
- Chat : inchangé (déjà orchestration).  
- CLI : conserver `Standard` mais prompt EN aligné protocole (phase 1).  
- Marquer `RoleId::Standard` `#[doc = "CLI / professor only, not IDE chat"]`.  
- Professor : soit basculer supplément professor sur run orchestration (si mode professor utilisé en chat), soit documenter « professor hors orchestration ».

**Option D2 — Aggressive**  
- `main.rs` CLI utilise le même `drive_role_split_run` (sans UI intent).  
- Supprimer `CORE_SYSTEM_PROMPT` monolithique → réutiliser `ARCHITECT_SYSTEM_PROMPT` + message user.  
- Supprimer `RoleId::Standard`, nudges Standard, registry explore Standard.  
- **Effort** : élevé ; tests CLI + professor.

**Recommandation plan** : **D1** en 1.3.2 ; **D2** en 1.3.3 si le CLI doit converger.

#### 3.4 Préparer `engine.strictness` (futur)

Sans implémenter les réglages produit :

- [x] Documenter dans `CIRCUIT-MOTEUR-GATES-NUDGES.md` §13 (`EngineStrictness` stub).
- [x] Éviter d’ajouter de **nouvelles** listes de mots ; toute nouvelle gate = **structure** ou **marqueur**.

---

### Phase 4 — Branchement UI (chantier E)

- [x] E1 `drox.architect.interactionMode` (`auto` \| `discussion` \| `action`)
- [x] E2 `buildAgentRunParams` → `architectInteractionMode` (omis si `auto`)
- [x] E3 vignettes composer (`01a-architect-gate.js` + HTML webview)
- [x] E4 i18n `localize` (UI FR/EN selon locale VS Code)
- [x] E5 tests IDE + `protocol.rs`
- [ ] E6 (optionnel) afficher gate retenu dans le fil chat

| Étape | Fichier | Action |
|-------|---------|--------|
| E1 | `droxConfiguration.ts` | Setting `drox.architect.interactionMode` : `auto` \| `discussion` \| `action` (défaut `auto`). |
| E2 | `droxRunSettings.ts` | `buildAgentRunParams` → `architectInteractionMode` (camelCase RPC). |
| E3 | UI composer | Sélecteur (dropdown ou 3 boutons) — même zone que mode permission / modèles. |
| E4 | i18n | Libellés UI en français via `localize` ; **pas** le prompt modèle. |
| E5 | Tests | `droxCommon.test.ts` : mode `discussion` force le param ; `auto` absent ou `undefined`. |
| E6 | (Optionnel) | Afficher dans la bulle/system log le gate retenu (`architect_discuss` / `architect_edit`) pour debug — event moteur ou log CLI. |

**Comportement** :

- `auto` : comportement actuel (tour intent LLM).
- `discussion` / `action` : saute intent (`orchestration_run.rs` déjà prêt).

---

### Phase 5 — Validation & doc (½–1 j)

- [ ] Dogfooding [07](../../../feature-brainstorm/07-reponses-legere-sans-plan.md) : cocher critères MVP.
- [ ] `cargo test -p drox-engine -p drox-cli`.
- [ ] Tests workbench ciblés Drox.
- [ ] Mettre à jour [PATCHNOTES-1.3.2.md](PATCHNOTES-1.3.2.md) + entrée [JOURNAL-1.3.2.md](JOURNAL-1.3.2.md).
- [ ] [CIRCUIT-MOTEUR-GATES-NUDGES.md](CIRCUIT-MOTEUR-GATES-NUDGES.md) : schéma sans `v1_2`, section langue (system EN / réponse user via setting).

---

## Ordre d’exécution recommandé

```text
Phase 0 (décisions)
    → Phase 1 (EN prompts)     ─┐
    → Phase 2 (rename wire)    ─┼─ peuvent être parallélisés (PR séparées)
    → Phase 4 (UI branch)      ─┘
    → Phase 3 (dead code + alignement prompts orchestration — dépend A)
    → Phase 5 (validation)
```

**PR suggérées** (review facile) :

1. `refactor(orchestration): rename v1_2 → role_split` (+ alias)
2. `feat(prompts): English system prompts + remove user-keyword pedagogy`
3. `feat(ide): architect interaction mode setting`
4. `chore(engine): remove prepare_run_spec + doc 1.3.2`

---

## Risques et mitigations

| Risque | Mitigation |
|--------|------------|
| Casser le CLI `drox` one-shot | Garder D1 ; tests manuels `drox-cli` après traduction EN |
| Professor sans prompt si on touche Standard | Vérifier `permissionMode=professor` en chat ; brancher supplément sur orchestration si actif |
| Régression intent gate | Tests Rust `architect_gate` + 3 scénarios manuels |
| Confusion doc 1.2 vs 1.3.2 | Ne mettre à jour que docs **1.3.2** + note alias dans `parse()` |

---

## Definition of Done (global)

- [ ] Aucun prompt **injecté au modèle** en français (hors instruction « reply in French » explicite dans le bloc langue EN).
- [ ] Wire `orchestrationMode=role_split` IDE + moteur ; alias `v1_2` warn-only une release.
- [ ] Plus de pédagogie « si l’user dit analyse/audit » dans les prompts ; protocole marqueurs documenté.
- [x] `architectInteractionMode` exposé (réglages VS Code + vignettes composer).
- [x] `prepare_run_spec` supprimé ; décision Standard documentée (**D1**).
- [ ] PATCHNOTES + JOURNAL à jour.

---

## Suivi d’avancement

| Phase | Statut | Date | Notes |
|-------|--------|------|-------|
| 0 | ☐ | | |
| 1 | ☐ | | |
| 2 | ☐ | | |
| 3 | ☐ | | |
| 4 | ☐ | | |
| 5 | ☐ | | |
