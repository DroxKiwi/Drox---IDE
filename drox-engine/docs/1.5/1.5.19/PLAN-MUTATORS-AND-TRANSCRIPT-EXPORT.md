# Plan 1.5.19 — Unification mutateurs + export transcript dev

**Statut** : **livré (code + docs)** · smoke / rebuild `drox.exe` encore à valider · **Date** : 2026-07-26  
**Version** : `droxVersion` **1.5.19**  
**Contexte** : suite smoke (boucles agent / bash « mutable » / commit Windows) + besoin de partager des runs complets avec l’assistant.

**Docs liées**

| Fiche | Rôle |
|-------|------|
| [ENGINE-RUST-AGENT-LOOPS.md](ENGINE-RUST-AGENT-LOOPS.md) | Change log moteur E1–E12 (détail avant/après / tests) |
| [FEATURES-DEV-TRANSCRIPT-EXPORT.md](FEATURES-DEV-TRANSCRIPT-EXPORT.md) | Export transcript natif (dev) |
| [README.md](README.md) | Index 1.5.19 |
| Cet fichier | Backlog + critères d’acceptation |

---

## Objectifs

1. **Une seule vérité** pour « bash inspectif vs mutateur » (gates agent + permissions + prompts).
2. **Documenter précisément** tout touch moteur Rust (fichier, avant/après, but, tests).
3. **Export / copie transcript complet** (réflexion + réponse + outils) en **surface dev**, depuis le chat **natif IDE** (réutiliser la pipeline webview existante).

---

## Workstream A — Unification mutateurs (moteur Rust)

### Problème

Trois classifieurs divergent :

| Couche | Emplacement | Symptôme |
|--------|-------------|----------|
| Gate `todo_write` | `agent.rs` whitelist maison | OK post-fix pour `git status` |
| Permissions | `drox-bash::kind_of_segment` | `cargo`/`npm` toujours Mutating ; `git fetch` ReadOnly |
| Gate testing | `bash_command_counts_as_code_mutation` | Liste d’exclusions git ad hoc |

Autres trous : `copy_path` absent du step-tracking ; Professeur gate **tout** `bash` ; `phase_for_tool` force `Acting` pour tout bash ; prompts encore ambigus (en-tête module, 7bis, clarifying).

### Décision d’architecture

**Source de vérité** = crate `drox-bash` (`classify.rs`).

| API à ajouter / étendre | Usage |
|-------------------------|--------|
| Affiner `kind_of_segment` | `cargo check\|test\|clippy|…`, `npm/pnpm/yarn test`, `tsc`, `gh auth status|pr view|…` → **ReadOnly** ; `git config` write → **Mutating**, `--get/--list` → ReadOnly |
| `command_is_inspect_only(cmd) -> bool` | Tous segments `ReadOnly` (via `split_command_segments`) ; redirects fichier → non |
| Agent gates | `requires_todo_write_gate` / step-tracking / professor / `phase_for_tool` consomment cette API |
| Gate testing | Mutateur **code** = écriture sources **ou** bash `Mutating\|Destructive` **hors** plumbing VCS (réutiliser flags git, pas une 3ᵉ liste opaque) |

### Tâches A (ordre)

| ID | Tâche | Fichiers | Doc moteur |
|----|-------|----------|------------|
| A1 | Affiner classifieur `drox-bash` (vérifs build + git config + gh inspect) + tests unitaires | `drox-bash/src/classify.rs` | § E6 dans ENGINE-RUST… |
| A2 | Exposer `command_is_inspect_only` (+ tests chaînes `&&`) | `drox-bash/src/lib.rs` / `classify.rs` | E6 |
| A3 | Remplacer whitelist `agent.rs` par `drox_bash::…` ; supprimer doublons | `drox-engine/src/agent.rs` | E7 |
| A4 | Aligner gate testing sur `BashCommandKind` + exclusion VCS claire | `agent.rs` | E8 |
| A5 | `copy_path` dans step-tracking | `agent.rs` | E9 |
| A6 | Professeur : exempt bash inspectif (comme todo gate) | `professor.rs` + tests | E10 |
| A7 | `phase_for_tool` : bash inspectif → Reading/Analyzing | `agent.rs` | E11 |
| A8 | Harmoniser `CORE_SYSTEM_PROMPT` (en-tête module, clarifying, 7bis) | `drox-cli/src/prompts.rs` | E12 |
| A9 | Mettre à jour [ENGINE-RUST-AGENT-LOOPS.md](ENGINE-RUST-AGENT-LOOPS.md) (E6–E12 + schéma) | docs | obligatoire |
| A10 | Rebuild `drox.exe` + smoke : `git status` sans todo ; `cargo check` sans todo + permissions cohérentes ; `git add` bloqué | ops | checklist |

### Critères d’acceptation A

- [x] Aucune whitelist bash dupliquée dans `agent.rs` pour la gate todo.
- [x] `cargo check` / `npm test` / `git status` / `git fetch` = inspectif (todo + permissions) — tests unitaires.
- [x] `git add` / `git commit` / `git config user.email x` = mutateur todo — tests unitaires.
- [x] `copy_path` compte pour le nudge « ≥2 mutateurs ».
- [x] En Professeur + lesson active : `git status` OK ; `file_edit` toujours gated — tests.
- [x] Fiche ENGINE-RUST mise à jour (E6–E12).
- [ ] **Ops** : rebuild `drox.exe` + smoke manuel (A10).

---

## Workstream B — Copy / export transcript complet (dev only)

### Problème

Pour partager un run (réflexion, réponse, outils) avec l’assistant, il faut un export fiable. La pipeline **existe** pour le chat **webview** (`exportTranscript` + `formatDroxCombinedSessionExport`) ; le chat **natif IDE** n’y est pas branché.

### Décision

**Réutiliser** `handleDroxExportTranscript` / formatters PARTIE A–E (ui-replay + transcript + engine-trace).  
**Ajouter** une Action2 ViewTitle sur `DroxNativeChatView`, gated `isDroxDevFeatureEnabled('exportTranscript')` + `droxSurface === 'dev'`.

Contenu attendu (déjà dans le combiner) :

- Phases / réflexion (`thinking`, `internal_reasoning`, native thinking si présent)
- Réponse utilisateur (`answering`, deltas)
- Outils (start/finish, noms, args, résultats)
- Optionnel : engine-trace

### Tâches B

| ID | Tâche | Fichiers |
|----|-------|----------|
| B1 | Permettre `handleDroxExportTranscript` avec `sessionId` explicite (natif) | `droxChatTranscriptExport.ts` |
| B2 | Action `drox.nativeChat.exportTranscript` + menu ViewTitle | `droxNativeChatViewActions.ts` (+ pane getter session) |
| B3 | Vérifier label UX (« Copy / export full transcript ») + toast succès / chemin `.drox/exports/` | idem |
| B4 | (Optionnel P2) Filtre « dernier user-run seulement » | formatters + flag |
| B5 | Doc courte dans 1.5.19 (section B de ce plan ou `FEATURES-DEV-TRANSCRIPT-EXPORT.md`) | docs |
| B6 | Smoke manuel surface `dev` : bouton visible natif ; `release` : absent | ops |

### Critères d’acceptation B

- [x] Action `drox.nativeChat.exportTranscript` + `exportDroxSessionTranscript` (thinking + tools + réponse).
- [x] Gate `exportTranscript` + `droxSurface === 'dev'` (tests `droxDevSurface.test.ts`).
- [x] Pas de nouveau formateur (réutilise combiner existant) ; last-run = P2 non fait.
- [ ] **Ops** : smoke manuel surface `dev` / `release` (B6).

---

## Workstream C — Documentation & traçabilité

| ID | Tâche |
|----|-------|
| C1 | Étendre ENGINE-RUST pour E6–E12 (même niveau de détail que E1–E5) |
| C2 | Mettre à jour [README.md](README.md) (liens plan + export) |
| C3 | Cocher ce plan au fil de l’eau (statuts ci-dessous) |

**Règle projet** : tout patch moteur Rust en 1.5.19 **doit** avoir une entrée numérotée dans ENGINE-RUST (but, avant/après, fichiers, tests).

---

## Hors scope (ne pas glisser)

- Remplacer le shell Windows par PowerShell.
- Réintroduire le rail VERIFY 1.4.
- Export transcript en surface `release` (sauf décision produit ultérieure).
- Refonte complète des permissions Ask/Allow UI.

---

## Ordre d’exécution recommandé

```text
1. A1–A2 (drox-bash) → tests crate
2. A3–A7 (agent + professor) → tests agent
3. A8 prompts → tests prompts
4. A9 doc ENGINE-RUST
5. B1–B3 export natif → smoke UI
6. B5–B6 + C2 README
7. A10 rebuild drox.exe + smoke mutateurs
```

---

## Suivi d’avancement

| Workstream | Statut |
|------------|--------|
| A Unification mutateurs | ✅ livré (E6–E12 dans ENGINE-RUST) |
| B Export transcript natif | ✅ livré ([FEATURES-DEV-TRANSCRIPT-EXPORT.md](FEATURES-DEV-TRANSCRIPT-EXPORT.md)) |
| C Docs | ✅ plan + ENGINE-RUST + FEATURES |

---

## Historique

| Date | Note |
|------|------|
| 2026-07-26 | Plan créé après audit incohérences mutateurs + demande export run pour partage assistant |
| 2026-07-26 | Préalable déjà livré : E1–E5 (voir ENGINE-RUST-AGENT-LOOPS.md) |
| 2026-07-26 | Implémentation A+B : `drox-bash` unifié, agent/professor/prompts, export natif IDE |
| 2026-07-26 | **E13** hotfix : `2>&1` / fd-merge exclus de `has_file_redirect` (smoke ornith) |
| 2026-07-26 | **E14** : pipelines grep/awk/findstr inspectifs + alignement prompt/tool/gate |
