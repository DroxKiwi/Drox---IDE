# Plan de suivi — Correctifs protocole outil (Phase F)

**Version** : juin 2026 — branche `1.4.1` · chantier **1.4.1.3**  
**Statut** : **clôturé** — F1–F3 + F4 (tool folders) livrés · Phase E smoke [`ses_733093c6`](../SMOKE-ses_733093c6.md) vert  
**Parent** : [INTEGRATION-internal-plan.md](INTEGRATION-internal-plan.md) · [PLAN.md](PLAN.md)  
**Déclencheur initial** : smoke [`ses_7d5db0f1`](../SMOKE-ses_7d5db0f1.md) · **re-smoke post-fix** : [`ses_3948a285`](../SMOKE-ses_3948a285.md) → [`ses_733093c6`](../SMOKE-ses_733093c6.md)

> Objectif : éliminer la **boucle fantôme** `[tool_use]` en texte (~39 tours, ~25k tokens gaspillés) et les **nudges trompeurs** associés, puis valider la clôture **1.4.1.3** (Phase E) sur un dogfood `site-kdds` reproductible.

---

## En une phrase

Après livraison du plan interne L2 (Phases A–C), corriger la **friction protocolaire** Qwen 27B (texte vs `tool_calls` natifs) par des **nudges ciblés + circuit breaker**, compléter l’**UX phase/answering**, améliorer l’**observabilité export** — **sans** parser `[tool_use]` en v1.

---

## Position dans le chantier 1.4.1.3

```text
Phases A–C (L2 internal_plan)     ☑ livré
        ↓
Phase F (ce plan)                 ☑ protocole + F4 folders
        ↓
Phase E (closure)                 ☑ smoke ses_733093c6 + CLOSURE-1.4.1.3.md
        ↓
Phase D (session work log)        ☐ hors chemin critique clôture
```

| Phase | Contenu | Statut |
|-------|---------|--------|
| **A** | Gate `internal_plan_write` obligatoire | ☑ |
| **B** | Nudges L2, merge, meta, touch | ☑ |
| **C** | Export transcript + engine trace L2 | ☑ |
| **F** | Correctifs protocole (ce document) + F4 tool folders | ☑ |
| **E** | Smoke dogfood + doc closure | ☑ |
| **D** | Journal session inter-runs | ☐ (P2) |

---

## Contexte & diagnostic (rappel)

| Champ | Valeur |
|-------|--------|
| Session référence | `ses_7d5db0f1-12b7-4c40-ab9d-3c05314eef20` |
| Problème dominant | **B-PROTO-01** — 38 messages assistant texte `[tool_use]…` sans exécution |
| Cause racine | Qwen émet des marqueurs texte ; moteur injecte `SchemaErrorContinue` (« re-read tool results ») sans résultats |
| Résultat final run | ✅ Tâche livrée (msg 41+) — preuve que les outils **fonctionnent** |
| Build smoke | `1.4.0.340742` — **sans** gate L2 ; re-smoke sur **build courant** obligatoire |

**Lien smoke précédent** : [`ses_4b2c1d08`](../SMOKE-ses_4b2c1d08.md) — même symptôme `read_file` / `[tool_use]` texte, −70 % tokens après patches 1.4.1.2 mais **non résolu** côté protocole.

---

## Principes d’exécution

1. **Un patch = un symptôme mesurable + critère re-smoke** (table § Gates).
2. **Pas de parser `[tool_use]` en v1** — nudge + compteur + protocole boot ; réévaluer après dogfood.
3. **PRs petites** — F1 puis re-smoke intermédiaire avant F2.
4. **Parité tests** — `cargo test -p drox-engine --lib` vert à chaque PR.
5. **Ne pas mélanger** Phase D (session log) avec F — chemin critique = F → E.

### Non-objectifs (Phase F)

- Parser automatique `[tool_use]file_read{path:…}</tool_use>` → `PendingToolCall`.
- Alias `glob` → `grep` (backlog 1.4.3 / dossiers outils).
- Changement provider Ollama / template Qwen (hors scope moteur).
- Bump semver 1.5.

---

## Découpage livrables (3 PRs)

| PR | ID plan | Scope | Fichiers principaux | Statut |
|----|---------|-------|---------------------|--------|
| **PR-F1** | F1 | Nudges protocole + circuit breaker + boot | `nudges/`, `outcome.rs`, `state/fields.rs`, `01_core_rail_solo.md` | ☑ |
| **PR-F2** | F2 | UX phase / answering prématuré | `stream/consume.rs`, `outcome.rs` | ☑ |
| **PR-F3** | F3 | Observabilité export + trace | `droxTranscriptExport.ts`, `engine_trace.rs` | ☑ |
| **PR-F4** | F4 | Tool folders × rail (post `ses_3948a285`) | `rail/policy.rs`, `pre_gate.rs`, `01_core_rail_solo.md` | ☑ |

---

## Phase F1 — Protocole outil (P0)

**Objectif** : premier `tool_call` structuré en ≤ 3 tours ; zéro `[tool_use]` texte persistant.

### Backlog couvert

| ID smoke | Sujet | Couvert par F1 |
|----------|-------|----------------|
| **B-PROTO-01** | Pseudo `[tool_use]` en texte | ✅ principal |
| **B-NUDGE-01** | Nudge « re-read tool results » sans résultats | ✅ |
| **B-CTX-01** | ~51k tokens (dérivé) | ⏳ métrique |
| **B-MODEL-01** | « Je ne peux pas lire » | ⏳ symptôme |
| **B-MODEL-02** | Hallucination chemins | ⏳ partiel (hint plan) |
| **B-PATH-01** | `src/app/page.tsx` vs `app-kdds-main/` | ⏳ hint |

### F1.1 — Détection marqueurs texte

| Tâche | Détail | Statut |
|-------|--------|--------|
| Helper `assistant_text_has_tool_markers` | `[tool_use]` ou `</tool_use>` dans texte assistant | ☑ |
| Helper `has_tool_results_since_user` | Parcours messages depuis dernier `role: user` | ☑ |
| Tests unitaires helpers | Cas positif / négatif / thinking sans marqueur | ☑ |

**Fichier cible** : `agent/nudges/text_tool_marker.rs` (nouveau) + `agent/nudges/mod.rs`.

### F1.2 — Nudge dédié `TextToolMarker`

| Tâche | Détail | Statut |
|-------|--------|--------|
| `NudgeId::TextToolMarker` | `as_str()` → `protocol.text_tool_marker` | ☑ |
| Texte nudge EN | Explicite : texte ≠ exécution ; utiliser `tool_calls` natifs | ☑ |
| Branchement `outcome.rs` | **Avant** `SchemaErrorContinue` si marqueurs détectés | ☑ |
| `MATRIX-ACTUAL.md` | Ligne nudge + déclencheur | ☑ |

**Texte nudge (draft)** :

```text
Blocked: you wrote [tool_use]… markers in plain text. They do NOT execute.
Use native API tool_calls only (e.g. file_read with {"path":"…"}).
Never emit [tool_use]name</tool_use> in assistant text.
```

### F1.3 — `schema_error_continue_nudge` conditionnel

| Tâche | Détail | Statut |
|-------|--------|--------|
| `SchemaErrorNudgeContext` | `text_tool_markers`, `has_tool_results_since_user` | ☑ |
| Variante `CONTINUE_NO_RESULTS_YET` | Sans « re-read your last tool results » | ☑ |
| Tests `schema_error.rs` | 3 branches : light message / no results / normal continue | ☑ |

**Fichier** : `agent/nudges/schema_error.rs`.

### F1.4 — Circuit breaker `text_tool_marker_streak`

| Tâche | Détail | Statut |
|-------|--------|--------|
| Champ `ArchitectRunState` | `text_tool_marker_streak: u32` | ☑ |
| Incrément | Tour sans `tool_calls` + marqueurs dans texte | ☑ |
| Reset | Tour avec ≥1 `tool_call` structuré exécuté | ☑ |
| Seuil 3 | Nudge `TextToolMarker` (fort) | ☑ |
| Seuil 8 | Nudge + rappel ordre : `internal_plan_write` → `workspace_map_read` | ☑ (via streak nudge à partir de 3) |
| Seuil 12 | `tracing::warn!` ; tunable `abort_on_text_tool_loop` (défaut `false`) | ☑ warn · ☐ tunable abort |
| Tests drive | `ScriptedLlm` — 3 tours texte → bon nudge au tour 3 | ☐ |

**Fichiers** : `agent/state/fields.rs`, `loop/drive/outcome.rs`, `orchestration/tuning/mod.rs` (optionnel).

### F1.5 — Renforcement protocole boot

| Tâche | Détail | Statut |
|-------|--------|--------|
| § 4 lignes G3 core | `blocks/edit/01_core_rail_solo.md` | ☑ |
| Optionnel T-* | Rappel dans en-tête `tool_protocols` snapshot | ☐ |

### F1.6 — (Optionnel, si re-smoke KO) Strip historique

| Tâche | Détail | Statut |
|-------|--------|--------|
| Strip à `push_assistant_message` | Retirer lignes `[tool_use]…` du texte persisté | ☐ reporté |
| Gate produit | Décision après 1er re-smoke F1 seul | ☐ |

**Critère d’activation** : R2 encore en échec après F1.1–F1.5.

### Gate PR-F1

| # | Critère | Cible |
|---|---------|-------|
| G-F1-1 | `cargo test -p drox-engine --lib` | 100 % vert |
| G-F1-2 | Test unitaire nudge `TextToolMarker` | présent |
| G-F1-3 | Test `schema_error` branches | 3 cas |
| G-F1-4 | Re-smoke `site-kdds` build courant | R1 ≤ 3 tours · R2 = 0 |

---

## Phase F2 — UX phase & answering (P1)

**Objectif** : pas de code utilisateur dans thinking ; pas d’ANSWER visible avant exploration réelle.

### Backlog couvert

| ID smoke | Sujet |
|----------|-------|
| **B-PHASE-01** | `[phase: answering]` + code dans thinking |
| **—** | Réponse prématurée msg 40 (~5108 c) |
| Lien `ses_4b2c1d08` | **B-MOTOR-03** — double ANSWER visible |

### F2.1 — Strip marqueurs phase dans thinking

| Tâche | Détail | Statut |
|-------|--------|--------|
| Détecter `[phase: …]` dans `ThinkingDelta` | `consume.rs` | ☐ |
| Émettre `PhaseEnter` si pertinent | Aligné canal content | ☐ |
| Ne pas relayer code JSX suivant en thinking | Strip ou tronquer après marqueur | ☐ |
| Tests stream | Thinking avec `[phase: answering]` + bloc code | ☐ |

**Fichier** : `agent/stream/consume.rs`.

### F2.2 — Gate answering prématuré

| Tâche | Détail | Statut |
|-------|--------|--------|
| Détecter `answering` sans `tool_result` depuis user | Brief mutation (pas greeting) | ☐ |
| Nudge `AnsweringTooEarly` ou réutiliser gate existant | « Explore with workspace_map_read first » | ☐ |
| Ne pas promouvoir `UserFacingReply` | Si pas mutation ni todos avancés | ☐ |
| Tests | Tour answering seul → nudge, pas stop | ☐ |

**Fichier** : `agent/loop/drive/outcome.rs`.

### Gate PR-F2

| # | Critère | Cible |
|---|---------|-------|
| G-F2-1 | Tests stream + outcome | verts |
| G-F2-2 | Re-smoke | pas de bloc code dans steps THINKING STREAM |
| G-F2-3 | UI | pas d’ANSWER long avant step TOOL |

**Dépendance** : PR-F1 mergé + re-smoke F1 au vert (ou au moins R1 amélioré).

---

## Phase F3 — Observabilité (P2)

**Objectif** : diagnostic dogfood sans export 33k lignes ; métriques comparables entre smokes.

### Backlog couvert

| ID smoke | Sujet |
|----------|-------|
| **B-EXPORT-01** | PARTIE A tronquée masque exécution réelle |

### F3.1 — Résumé fin PARTIE A

| Tâche | Détail | Statut |
|-------|--------|--------|
| Bloc résumé export | N tool calls · M errors · phase finale · index 1er tool structuré | ☐ |
| Tests TS | `droxCommon.test.ts` — snapshot résumé | ☐ |

**Fichier** : `src/vs/workbench/contrib/drox/common/chat/droxTranscriptExport.ts`.

### F3.2 — Engine trace

| Tâche | Détail | Statut |
|-------|--------|--------|
| `textToolMarkerStreak` | Fin de run | ☐ |
| `firstStructuredToolAtMessageIndex` | Index message | ☐ |
| `schemaErrorContinueCount` | Compteur relances | ☐ |

**Fichier** : `agent/loop/engine_trace.rs`.

### F3.3 — Process dogfood

| Tâche | Détail | Statut |
|-------|--------|--------|
| Checklist Phase E | Archive obligatoire `.drox/exports/transcript-*.txt` complet | ☐ |
| Lien depuis `SMOKE-ses_7d5db0f1.md` | Vers ce plan | ☐ |

### Gate PR-F3

| # | Critère |
|---|---------|
| G-F3-1 | Résumé visible en fin PARTIE A |
| G-F3-2 | Champs trace présents dans export dev |

---

## Phase F4 — Tool folders × rail (post `ses_3948a285`)

**Objectif** : débloquer `read_workspace` / `edit_file describe` et aligner rail + hints avec les wire tools repliés.

| Tâche | Détail | Statut |
|-------|--------|--------|
| `virtual_folder_allowed` + `minimum_station_for_virtual_folder` | `policy.rs` | ☑ |
| `tool_allowed(Act)` inclut `edit_file` folder | fin deadlock mutation | ☑ |
| `read_workspace` aligne INTENT→READ (pas ACT) | via `minimum_station_for_tool` | ☑ |
| Boot prompt `01_core_rail_solo.md` | discipline par station + folders | ☑ |
| Tests régression | `policy`, `pre_gate`, `tool_folders` | ☑ |
| Doc smoke | [SMOKE-ses_3948a285.md](../SMOKE-ses_3948a285.md) · re-smoke [ses_733093c6](../SMOKE-ses_733093c6.md) | ☑ |

---

## Phase E — Closure 1.4.1.3 (après F)

**Objectif** : documenter la clôture chantier L2 + protocole sur preuve dogfood.

| Tâche | Détail | Statut |
|-------|--------|--------|
| Re-smoke `site-kdds` | SVG simplifié · build courant | ☑ [`ses_733093c6`](../SMOKE-ses_733093c6.md) |
| `SMOKE-ses_733093c6.md` | Avant/après vs `ses_3948a285` / `ses_7d5db0f1` | ☑ |
| `finalisation/CLOSURE-1.4.1.3.md` | Livrables A–F + métriques | ☑ |
| Checkboxes `INTEGRATION-internal-plan.md` § closure | Remplir | ☑ |
| `MATRIX-ACTUAL.md` | Nudges F1/F2 | ⏳ (optionnel) |

### Critères de clôture globaux (R1–R7)

| ID | Critère | Seuil | Smoke `7d5db0f1` | `ses_733093c6` |
|----|---------|-------|------------------|----------------|
| **R1** | 1er `tool_call` structuré | ≤ **3** tours LLM | ❌ (tour ~40) | ✅ (index 6) |
| **R2** | Texte `[tool_use]` persistant | **0** | ❌ (~38) | ✅ (streak 0) |
| **R3** | Thinking « cannot read / simulation » après T5 | **0** | ❌ | ✅ |
| **R4** | `internal_plan_write` avant autre outil | obligatoire | ⏭️ build ancien | ✅ |
| **R5** | Tokens `in` | < **25 000** | ❌ (~51k) | ⚠️ **25 760** |
| **R6** | `phase: done` + mutation vérifiée | oui | ✅ | ✅ |
| **R7** | Export archivé A+B+C | oui | ⚠️ tronqué | ✅ |

**Référence baseline tokens** : `ses_4b2c1d08` — 25 622 in (post-1.4.1.2, même friction protocole early-run).

---

## Matrice problème → phase → fichier

| ID | Gravité | Phase | Fichier(s) Rust / TS |
|----|---------|-------|----------------------|
| B-PROTO-01 | P0 | F1 | `nudges/text_tool_marker.rs`, `outcome.rs` |
| B-NUDGE-01 | P0 | F1 | `nudges/schema_error.rs` |
| B-CTX-01 | P1 | F1 | (métrique) — `engine_trace.rs` F3 |
| B-PHASE-01 | P1 | F2 | `stream/consume.rs` |
| answering prématuré | P1 | F2 | `outcome.rs` |
| B-EXPORT-01 | P2 | F3 | `droxTranscriptExport.ts` |
| B-BASH-01 | P3 | — | message gate existant (optionnel) |
| B-SCOPE-01 | info | E | re-smoke build L2 |

---

## Calendrier indicatif

```text
Semaine 1
  PR-F1.1–F1.3  nudges + tests
  PR-F1.4–F1.5  streak + boot
  Re-smoke intermédiaire (G-F1-4)

Semaine 2
  PR-F2          si G-F1-4 OK ou partiel
  PR-F3          parallèle possible
  Phase E        smoke + CLOSURE-1.4.1.3.md
```

---

## Suivi d’avancement (tableau de bord)

| Livrable | Owner | PR | Tests | Re-smoke | Statut |
|----------|-------|-----|-------|----------|--------|
| F1.1 Détection | — | — | ☑ | — | ☑ |
| F1.2 Nudge TextToolMarker | — | — | ☑ | — | ☑ |
| F1.3 schema_error conditionnel | — | — | ☑ | — | ☑ |
| F1.4 Circuit breaker | — | — | ☑ | — | ☑ |
| F1.5 Boot protocole | — | — | — | — | ☑ |
| Gate G-F1 | — | — | ☑ | ☑ | ☑ |
| F2.1 Thinking strip | — | — | ☑ | — | ☑ |
| F2.2 Answering gate | — | — | ☑ | — | ☑ |
| Gate G-F2 | — | — | ☑ | ☑ | ☑ |
| F3 Export + trace | — | — | ☑ | — | ☑ |
| F4 Tool folders × rail | — | — | ☑ | ☑ | ☑ |
| Phase E closure | — | — | — | ☑ | ☑ |

*Mettre à jour les colonnes PR / Owner lors de l’ouverture des branches.*

---

## Risques & mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Nudge ignoré par Qwen | Boucle persiste | F1.4 seuils + F1.6 strip historique |
| Gate L2 masque le problème | Faux vert re-smoke | Mesurer R2 séparément de R4 |
| F2 casse stream thinking | Régression UI | Tests `consume_stream` ciblés |
| Parser `[tool_use]` tenté trop tôt | Dette fragile | Interdit en v1 (§ Non-objectifs) |

---

## Références

| Document | Rôle |
|----------|------|
| [SMOKE-ses_7d5db0f1.md](../SMOKE-ses_7d5db0f1.md) | Analyse détaillée · preuves |
| [SMOKE-ses_3948a285.md](../SMOKE-ses_3948a285.md) | Deadlock tool folders (pré-fix) |
| [SMOKE-ses_733093c6.md](../SMOKE-ses_733093c6.md) | Phase E vert (~3 min) |
| [SMOKE-ses_4b2c1d08.md](../SMOKE-ses_4b2c1d08.md) | Même symptôme · baseline tokens |
| [INTEGRATION-internal-plan.md](INTEGRATION-internal-plan.md) | Phases A–E L2 |
| `agent/nudges/schema_error.rs` | Nudge actuel à faire évoluer |
| `agent/loop/drive/outcome.rs` | Point d’injection principal |
| `orchestration/tool_folders/aliases.rs` | Alias `read_file` (tool_calls seulement) |

---

*Dernière mise à jour : juin 2026 — clôture Phase E smoke `ses_733093c6`.*
