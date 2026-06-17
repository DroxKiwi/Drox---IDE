# Plan 1.4.4 — Profils de sampling LLM par contexte

**Version** : juin 2026  
**Base** : `role_split` + rail 1.4.0 + context frame 1.4.1.3 + **profil produit unique** (plus de `engine.strictness` / `engine.tuning.*` côté utilisateur)  
**Prérequis** : [1.4.1](../1.4.1/README.md) stabilisé · [1.4.3](../1.4.3/PLAN-1.4.3.md) optionnel (index n’impacte pas ce plan)

---

## Vision

Chaque **tour LLM** (`drive_llm_turn` → `stream_chat`) reçoit des `ChatOptions` résolues depuis :

1. **Baseline** — `LlmConfig` / env / Settings IDE (comme aujourd’hui) ;
2. **Fichier profils** — merge arboré selon le **contexte courant** du run.

L’utilisateur final (release) ne voit rien : le fichier vit dans l’environnement de **dev / dogfood** (workspace `.drox/` ou répertoire machine documenté).

---

## Cas d’usage (exemple Qwen 27B)

| Contexte | Intention sampling | Exemple |
|----------|-------------------|---------|
| Premier message, mode **discussion** | Réponses naturelles, légère variété | `top_p: 0.9`, `repeat_penalty: 1.05` |
| Station rail **plan** / `internal_plan_write` | Structuration, peu de divagation | `temperature: 0.4`, `top_p: 0.85` |
| Phase **acting**, outil `file_edit` | Patch précis, peu de hallucination | `temperature: 0.15`, `repeat_penalty: 1.0`, `top_p: 0.8` |
| Phase **answering** (clôture user-facing) | Lisible, stable | `temperature: 0.5`, `top_p: 0.9` |
| Sous-run **executor** | Aligné edit, tokens courts | hérite `acting` + `num_predict` borné |

Le fichier permet de **nommer** ces régimes et de les ajuster sans recompiler ni toucher aux dizaines de clés `engine.tuning.*` retirées du produit.

---

## Modèle de configuration

### Emplacement (proposition)

| Priorité | Chemin | Usage |
|----------|--------|-------|
| 1 | `<workspace>/.drox/llm-sampling.yaml` | Dogfood par repo (site-kdds, etc.) |
| 2 | `$DROX_LLM_SAMPLING_PROFILE` | Chemin absolu (CI, scripts) |
| 3 | `~/.drox/llm-sampling.yaml` | Préférences machine dev (optionnel P2) |

Absence de fichier → comportement **identique à aujourd’hui** (baseline seule).

### Format YAML — arbre à merge

```yaml
version: 1

# Hérité par tous les tours si aucun profil plus spécifique ne matche.
defaults:
  sampling:
    temperature: 0.7
    top_p: 0.9
    top_k: 40
    repeat_penalty: 1.05
    min_p: 0.05

profiles:
  discuss:
    match:
      architect_interaction: discussion   # ou gate architect_discuss
    sampling:
      top_p: 0.9
      repeat_penalty: 1.05

  plan:
    match:
      rail_station: plan
    extends: discuss                      # merge parent → enfant
    sampling:
      temperature: 0.4

  file_mutation:
    match:
      phase: acting
      tool_any: [file_edit, file_write, notebook_edit]
    sampling:
      temperature: 0.15
      top_p: 0.8
      repeat_penalty: 1.0

  answering:
    match:
      phase: answering
    sampling:
      temperature: 0.5
      top_p: 0.9
```

**Règles de merge** (à implémenter) :

- `extends: <id>` — fusion profonde `sampling` (enfant écrase parent) ;
- plusieurs profils matchent → **spécificité** décroissante : `tool` > `rail_station` > `phase` > `architect_interaction` > `defaults` ;
- à égalité → ordre de déclaration dans le fichier ;
- clés inconnues → warning trace, ignorées ;
- valeurs `null` → **réinitialiser** au baseline run (opt-in explicite).

### Dimensions de `match` (v1)

| Clé | Source moteur | Notes |
|-----|---------------|-------|
| `phase` | `Phase` courante / prochaine (`reading`, `acting`, `answering`, …) | Voir [10-evenements-phases](../moteur/10-evenements-phases/README.md) |
| `rail_station` | `architect_state.rail.station` | Si rail actif |
| `tool_any` | specs outils du tour (`drive_llm_turn`) | Avant appel LLM |
| `tool_folder` | dossier outil context frame 1.4.1.3 | Optionnel P1 |
| `architect_interaction` | `discussion` \| `action` \| `auto` | Dérivé gate / RPC |
| `role` | `architect` \| `executor` \| `intent` | Sous-runs |

Extensions futures : `model` (regex), `iteration_min` / `iteration_max`, `native_thinking: true`.

---

## Résolution au runtime

```text
agent.run démarre
  → charge LlmConfig (RPC / env)     # inchangé
  → parse llm-sampling.yaml (lazy, cache mtime)

chaque drive_llm_turn (avant stream_chat)
  → ctx = TurnSamplingContext {
        phase, rail_station, role,
        tool_names[], architect_interaction,
        llm_iter
     }
  → profile_id, sampling = resolve_sampling(ctx, file, run_baseline)
  → chat_options' = chat_options.merge(sampling)
  → emit LlmTurnPrepared { …, sampling_profile: profile_id, sampling_applied: {…} }
  → llm.stream_chat(messages, chat_options')
```

**Point d’accroche code** : `drox-engine/.../agent/loop/drive/llm_turn.rs` (aujourd’hui `self.config.chat_options.clone()` sans override par tour).

**CLI** : pas de nouveaux champs RPC obligatoires en v1 — le fichier est lu côté moteur depuis le `workspace` du run. Option dev : `agent.run` flag `llmSamplingProfilePath` pour tests.

---

## Livrables par phase

### P0 — Contrat & parseur

| # | Livrable | Critère |
|---|----------|---------|
| P0.1 | Schéma `llm-sampling.yaml` v1 + exemple | Validé en revue |
| P0.2 | Crate / module `drox_engine::llm_sampling` — parse, `extends`, merge | Tests unitaires merge + spécificité |
| P0.3 | `TurnSamplingContext` + `resolve_sampling` | Table de cas documentée |

### P1 — Intégration boucle agent

| # | Livrable | Critère |
|---|----------|---------|
| P1.1 | Hook `drive_llm_turn` | `file_edit` run utilise profil `file_mutation` (trace) |
| P1.2 | Extension `AgentEvent::LlmTurnPrepared` | `sampling_profile` + snapshot params |
| P1.3 | Log engine trace (partie E) | Une ligne par tour : profil + `top_p` / `temperature` effectifs |
| P1.4 | Hot-reload (mtime) | Modifier YAML entre deux messages sans redémarrer `drox --serve` |

### P2 — Dogfood & tooling

| # | Livrable | Critère |
|---|----------|---------|
| P2.1 | `examples/llm-sampling.example.yaml` dans repo | Copié vers `.drox/` doc |
| P2.2 | Profil **site-kdds** / Qwen 27B commité (dev) | Smoke `chat_qwen27b` moins de répétitions en edit |
| P2.3 | `drox doctor` (optionnel) | Valide YAML + liste profils |

---

## Non-objectifs

- Pas de réintroduction `drox.engine.tuning.*` dans Settings ;
- Pas d’UI vignette chat pour éditer les profils (fichier + PR) ;
- Pas de profils **par modèle téléchargeable** marketplace en 1.4.4 ;
- Pas de changement du **profil moteur** (rails, gates, budgets) — uniquement **sampling LLM**.

---

## Critères d’acceptation (smoke)

1. Sans fichier → bit-exact sampling vs 1.4.1 (régression nulle).
2. Avec exemple discuss + file_mutation → trace montre **deux** `sampling_profile` distincts sur un run edit multi-tours.
3. `repeat_penalty: 1.05` en discuss et `1.0` en `file_edit` observables dans requête Ollama (log debug ou trace export).
4. Fichier invalide → run continue avec baseline + **un** warning user-visible (chat errors).

---

## Risques & mitigations

| Risque | Mitigation |
|--------|------------|
| Explosion de combinaisons profils | Spécificité + `extends` + doc exemple minimal |
| Divergence IDE Settings vs fichier | Fichier **override tour** seulement ; Settings = baseline run |
| Modèles qui ignorent certains params | Doc par provider ; champs non supportés no-op côté `drox_llm` |
| Coût parse à chaque tour | Cache + mtime ; parse < 1 ms |

---

## Liens

- [README 1.4.4](README.md)
- [Exemple YAML](examples/llm-sampling.example.yaml)
- [llm_turn.rs](../../../drox/crates/drox-engine/src/agent/loop/drive/llm_turn.rs)
- [build_llm_config](../../../drox/crates/drox-cli/src/jsonrpc/handlers/common.rs)
