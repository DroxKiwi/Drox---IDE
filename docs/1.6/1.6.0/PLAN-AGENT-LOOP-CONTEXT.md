# PLAN — Agent loop · contexte · compaction (1.6.0)

**Objectif** : éliminer (ou borner durement) les boucles de réponse et les explosions de contexte sans changer le paradigme Drox.  
**Baseline** : [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md)

---

## Non-objectifs

- Remplacer le protocole de phases (`analyzing` / `acting` / `answering` / `done`).  
- Abandonner MEMORY/DROX ou la régulation L1–L5.  
- « Fine-tuner » un modèle spécifique.  
- Refonte UI chat hors jauge / export debug.

---

## Lots

### OBS — Observabilité prompt (prioritaire si possible tôt)

| ID | Tâche | Done when |
|----|--------|-----------|
| OBS-1 | Définir un **unlock debug** (token / setting machine) pour activer l’export en build `release` | Doc + setting + garde |
| OBS-2 | Export par run : messages envoyés au LLM **par itération** (roles, tailles, nudges) | Fichier sous `.drox/` ou panneau debug |
| OBS-3 | Afficher côte à côte `estimated_ctx` et `provider_input_tokens` | UI Agents + IDE |

### COMPACT — Persistance compaction IDE

| ID | Tâche | Done when |
|----|--------|-----------|
| C-1 | Après compaction live JSON-RPC : **réécrire** le transcript (comme TUI `rewrite_transcript`) | Test moteur + dogfood : JSONL shrink |
| C-2 | Aligner `/compact` / `session.compact` sur la même persistance | Transcript réduit après compact manuel |
| C-3 | Vérifier curseur `flush_transcript` après shrink (pas de trous assistant/tool) | Tests lifecycle |

### LOOP — Drive & LoopDetector

| ID | Tâche | Done when |
|----|--------|-----------|
| L-1 | Retirer `loop_detector.reset()` des nudges `DONE_ONLY` / générique (sauf cas explicitement justifiés) | Tests `loop_tests` verts + nouveau cas |
| L-2 | Hard-stop ou pivot après **N** réponses textuelles identiques sans tool (N=2 ou 3) | Abort propre ou force `done` |
| L-3 | Option : ne pas convertir les nudges mid-run en faux `user` pour les providers locaux (garder system si supporté) | Eval Ollama / OpenAI-compat |
| L-4 | Documenter le contrat « quand le moteur a le droit de rappeler le modèle » | Court paragraphe engine doc |

### GAUGE — Compteurs

| ID | Tâche | Done when |
|----|--------|-----------|
| G-1 | Ne plus écraser silencieusement l’estimation par le provider sans label | UI claire |
| G-2 | Log debug du ratio estimate/provider sur gros prompts | Trace utile dogfood |

### TOOLS — Plafonds

| ID | Tâche | Done when |
|----|--------|-----------|
| T-1 | Microcompact ou truncate pour résultats `task` / Explore | Rapport plafonné |
| T-2 | Revoir plafond effectif `file_read` dans le prompt (vs 512 KiB brut) | Budget contexte respecté |

---

## Preuves d’acceptation (dogfood)

| Scénario | Avant (baseline) | Après (cible) |
|----------|------------------|---------------|
| Discussion longue + GLM/local flash | Réponses ×2–3, run long | Stop ou pivot ≤ 3 itérations identiques |
| Message après run compacté | Jauge ×~2 / contexte plein | JSONL compacté ; jauge cohérente |
| Export debug | Impossible en prod | Unlock token → dump messages[] |

---

## Fichiers touchés (indicatif)

- `drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs`  
- `drox-engine/drox/crates/drox-engine/src/agent/run/lifecycle.rs`  
- `drox-engine/drox/crates/drox-engine/src/agent/loop_detect.rs`  
- `drox-engine/drox/crates/drox-engine/src/compaction/live.rs`  
- `drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers/mod.rs`  
- `drox-engine/drox/crates/drox-llm/src/openai/request.rs` · `ollama/stream.rs`  
- `src/vs/workbench/contrib/drox/browser/agents/*` (stats UI · export)  
- Tests : `loop_tests.rs` · lifecycle / compact

---

## Ordre recommandé

```text
OBS-1 (si rapide) → C-1/C-3 → L-1/L-2 → G-1 → T-1 → OBS-2 dogfood → ship
```

Si OBS prod est bloqué : démarrer par **C-1** + **L-1/L-2** avec tests Rust, puis OBS pour valider en dogfood.
