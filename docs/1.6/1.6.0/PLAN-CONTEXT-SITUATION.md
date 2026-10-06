# PLAN — Gestion de contexte « sérieuse » (1.6.0 Vague 4)

**Parent** : [README 1.6.0](README.md)  
**Baseline** : [DIAGNOSTIC-CONTEXTE-SERIEUX.md](DIAGNOSTIC-CONTEXTE-SERIEUX.md)  
**Statut** : 🟢 **Vague 4 livrée** (S-1…S-5) · dogfood D1–D5 + S1–S4 encore dûs  
**Prérequis livrés** : snip, spill T-1, compact persisté, filets boucle, FX-B large-write

---

## Cap

Aider le modèle à **comprendre la situation** avec un prompt **plus court et plus structuré** — sans BDD vectorielle sur le transcript, sans changer phases / tools / MEMORY / régulation L1–L5.

En une phrase : **carte d’état claire + moins de brut dans la fenêtre**.

---

## Non-objectifs

- Embeddings du fil de discussion comme source du prompt chaud.  
- Remplacer Explore / workspace map / MEMORY.  
- Fine-tune modèle.  
- Refonte UI chat hors affichage éventuel de la situation card (debug).  
- Lazy MCP discovery (reste backlog post-1.6).  
- S-6 / S-7 (optionnels) — reportés si dogfood OK sans eux.

---

## Ordre d’exécution — Vague 4

```text
Vague 4a — situation     : S-1 ✅
Vague 4b — évacuation    : S-2 ✅ → S-3 ✅
Vague 4c — charge        : S-4 ✅ (compress) → S-5 ✅
Vague 4d — optionnel     : S-6 · S-7 ⬜
Clôture 1.6.0            : dogfood → RELEASE_NOTES → CLOSURE → ship
```

---

## Lots (état)

| ID | Titre | État |
|----|--------|------|
| S-1 | Situation card chaque tour | ✅ `agent/situation/` + `drive.rs` |
| S-2 | Snip chaud + spill 24 KiB | ✅ `lifecycle` / `ContextPolicy::maybe_snip_hot` / dispatch |
| S-3 | Compact Goal/Done/Next/Files/Blockers | ✅ `COMPACTION_PROMPT` + `format_compact_checkpoint` |
| S-4 | CORE compressé + note situation card | ✅ `prompts.rs` |
| S-5 | Nudge parent heavy reads → Explore | ✅ `PARENT_HEAVY_READ_NUDGE` |
| S-6 | Tool surface par phase | ⬜ optionnel |
| S-7 | Retrieval mémoire smart | ⬜ optionnel |
---

## Lots

### S-1 — Situation card (★★★)

**Quoi** : avant chaque `stream_chat`, injecter (ou rafraîchir) un bloc **system** court, déterministe, hors historique narratif :

```text
# Run situation (engine)
- objective: …
- todos: N open / M done — next: …
- files_touched: path1, path2, …
- last_tool_error: … | none
- permission_mode: …
- context_note: prefer re-read paths above; do not re-dump large files
```

**Sources** : compteurs déjà connus dans `drive_inner` (todos, mutations, `RunObjective`, dernier tool error).  
**Fichiers** : `drive.rs` / `nudges.rs` · module `agent/situation/` (card, paths, todos, task_outcome) · event optionnel `SituationCard` pour OBS.  
**Tests** : unit — card se met à jour après `todo_write` / tool error ; pas de doublon explosif (une card, remplacée).  
**Acceptation** : sur un run long, le modèle peut citer l’objectif / next todo **sans** relire 50 tool_results.

### S-2 — Éviction agressive tool results chauds (★★★)

**Quoi** : dès qu’un tool result dépasse N KiB **ou** n’est plus dans les K derniers tours, remplacer le corps par un stub :

`[tool_result spilled: path=.drox/tool-outputs/… size=… ; call file_read / bash only if needed]`

S’appuyer sur T-1 : étendre aux résultats encore « chauds » trop gros, et snip plus tôt (pas seulement au seuil autocompact).  
**Fichiers** : `lifecycle.rs` / compaction helpers / spill existant.  
**Acceptation** : dogfood « adapter docs » — plus de Get-Content entier qui reste ×N tours dans le prompt.

### S-3 — Checkpoint compact structuré (★★)

**Quoi** : `summarize_run` / live compact produit un schéma stable :

| Champ | Contenu |
|-------|---------|
| `goal` | Objectif user |
| `done` | Ce qui est livré |
| `next` | Prochaine action |
| `files` | Paths touchés |
| `blockers` | Erreurs / gates ouvertes |

Remplacer le résumé prose libre comme **seul** artefact post-compact.  
**Fichiers** : `compaction/summarize.rs`, prompts de résumé.  
**Acceptation** : après compact, un tour suivant reprend `next` sans re-explorer tout.

### S-4 — CORE prompt plus léger (★★)

**Quoi** : scinder `CORE_SYSTEM_PROMPT` :

- **Always-on** (~court) : phases, tool_calls natifs, anti-boucle, écriture incrémentale, lectures bornées.  
- **On-demand** : détails professor / micro-cycles longs → nudges ou suppléments régulation déjà existants.

Ne pas supprimer les règles : les **déplacer** pour que le toujours-présent tienne en budget attention.  
**Fichiers** : `drox-cli/src/prompts.rs` + tests anti-régression.  
**Acceptation** : taille always-on ↓ mesurable ; tests prompt existants adaptés.

### S-5 — Parent : Explore avant lecture massive (★★)

**Quoi** : nudge (voire soft-gate compteur) si le parent enchaîne M `file_read`/`bash` dump sans `task` Explore sur un scope large — rappel : « delegate Explore ; parent keeps brief only ».  
Complète le supplement Explore 1.5.23 ; n’impose pas Explore pour une needle.  
**Fichiers** : `drive.rs` / `nudges.rs` / prompts analyzing.  
**Acceptation** : scénario « overview docs/engine » → au moins 1 `task` explore ou lecture bornée, pas 10× Get-Content.

### S-6 — Tool surface par phase (★ optionnel)

Réduire descriptions / sous-ensemble tools hors `acting` si L2 régulation le permet. Secondaire vs S-1/S-2.

### S-7 — Retrieval mémoire smart (★ optionnel)

Injecter archives / MEMORY **par pertinence** (BM25 ou embeddings locaux) au lieu d’un dump de slugs au cold start. Uniquement après S-1…S-5.

---

## Déjà livré (ne pas refaire)

| Item | Vague |
|------|--------|
| Spill >48 KiB (T-1) | 2 |
| Compact → rewrite JSONL (C-1) | 1 |
| FX-B intent-only + `LARGE_WRITE_CHUNK` + UI abort | dogfood |
| Prompt incremental writes + anti Get-Content | dogfood |

---

## Preuves dogfood (Vague 4)

| # | Scénario | Attendu |
|---|----------|---------|
| D1 | Run multi-étapes docs | Situation card à jour ; pas de re-plan amnésique |
| D2 | Gros bash / file_read | Stub spill dès le tour suivant si > seuil |
| D3 | Compact mid-run | Checkpoint `goal/done/next/files` lisible |
| D4 | Overview large tree | Explore ou lectures bornées ; parent léger |
| D5 | Page multi-sections | Skeleton + `file_edit` (FX-B déjà là) |

---

## Fichiers touchés (indicatif)

- `drox-engine/.../agent/run/drive.rs`  
- `drox-engine/.../agent/nudges.rs` (+ évent. `situation.rs`)  
- `drox-engine/.../compaction/*`  
- `drox-engine/.../agent/run/lifecycle.rs`  
- `drox-cli/src/prompts.rs`  
- `src/vs/workbench/contrib/drox/...` (OBS / affichage card optionnel)  
- Tests : loop / compaction / prompts

---

## Liens

- [DIAGNOSTIC-CONTEXTE-SERIEUX.md](DIAGNOSTIC-CONTEXTE-SERIEUX.md)  
- [ETAPES-IMPLEMENTATION-LOOPS.md](ETAPES-IMPLEMENTATION-LOOPS.md)  
- [engine/sessions-and-memory.md](../../engine/sessions-and-memory.md)
