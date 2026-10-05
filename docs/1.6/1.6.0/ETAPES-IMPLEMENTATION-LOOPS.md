# Étapes d’implémentation — boucles & contexte (1.6.0)

**Statut** : Vague 1 appliquée (L-1 / L-2 / C-1 / C-3) · branche `1.6.0`  
**Baseline** : [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md)  
**Synthèse industrie** : Cursor / Claude Code / Cline — filets runtime + compaction durable + gros results hors prompt

Ce document est la **checklist opérable**. On ne change pas le paradigme (phases, MEMORY/DROX, L1–L5).

---

## Principes

1. **Garde runtime avant prompts** — borner le drive, ne pas « supplier » le modèle.  
2. **Une vague = shippable / testable** — tests Rust + smoke dogfood avant la suivante.  
3. **Pas de reset silencieux** du LoopDetector sans justification écrite.  
4. **Compaction = disque** — si ce n’est pas dans le JSONL, ça n’existe pas au prochain message.

---

## Vue d’ensemble

```text
Vague 1 (filets)     L-1 → L-2 → C-1 (+ C-3)   ✅ moteur
Vague 2 (contexte)   T-1 → L-tools → G-1
Vague 3 (preuve)     OBS-1 → OBS-2 → (L-3 optionnel)
Clôture              dogfood → RELEASE_NOTES → CLOSURE → ship
```

| ID | Titre | Vague | Effort | Impact | État |
|----|--------|-------|--------|--------|------|
| L-1 | Stop reset LoopDetector sur nudges | 1 | S | ★★★ | ✅ |
| L-2 | Hard-stop réponses textuelles identiques | 1 | M | ★★★ | ✅ |
| C-1 | Persister compaction live IDE | 1 | M | ★★★ | ✅ |
| C-3 | Curseur flush après shrink | 1 | S | ★★ | ✅ |
| T-1 | Gros tool results → fichier | 2 | M | ★★★ | ⬜ |
| L-tools | Hash tools global progress-aware | 2 | M | ★★ | ⬜ |
| G-1 | Jauge estimé vs provider | 2 | S | ★★ | ⬜ |
| OBS-1 | Unlock debug prod | 3 | S | ★★ | ⬜ |
| OBS-2 | Export messages[] par itération | 3 | M | ★★ | ⬜ |
| L-3 | Nudges sans faux `user` (providers locaux) | 3 | M | ★ | ⬜ |
| C-2 | Aligner `/compact` session | 2–3 | S | ★★ | ⬜ |

---

## Vague 1 — Filets immédiats

### Étape L-1 — Ne plus reset le LoopDetector sur nudges

**But** : les relances `DONE_ONLY` / nudge générique ne remettent plus le compteur à zéro.

| | |
|--|--|
| **Fichiers** | `drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs` |
| **Action** | Retirer `loop_detector.reset()` sur : answering sans done (`DONE_ONLY_NUDGE`), nudge sans tool/sans done. **Conserver** le non-reset déjà en place sur todo ouverte / testing dû. Documenter en commentaire chaque `reset()` restant (pourquoi). |
| **Tests** | Étendre `agent/tests/loop_tests.rs` : 3 réponses textuelles identiques + nudges `done` → abort ou hard path, **pas** 12 itérations. |
| **Done when** | `cargo test -p drox-engine loop` (ou suite loop) vert ; grep `loop_detector.reset()` justifié. |
| **Smoke** | Run local qui omet `done` : après 2–3 répétitions, stop net (pas régénération infinie). |

### Étape L-2 — Hard-stop réponses textuelles identiques (sans tool)

**But** : même texte assistant répété N fois sans tool_call → fin de run contrôlée (aligné Cline soft@2–3 / hard@3–4).

| | |
|--|--|
| **Fichiers** | `loop_detect.rs` · `drive.rs` |
| **Action** | Compteur dédié « text-only identical » (ou étendre le detector). Paramètres proposés : **warn @2**, **hard @3**. Hard = `EngineError::LoopDetected` **ou** forcer clôture avec message utilisateur clair (préférer abort propre + event UI). Ne pas exiger thinking identique (sinon contournement trivial). |
| **Tests** | Cas : même body, thinking différent → compte quand même ; tool_call différent → reset compteur texte. |
| **Done when** | Un run synthétique (mock LLM) s’arrête à N sans atteindre `max_iterations`. |
| **Smoke** | GLM / local flash : plus de ×5–12 copies de la même réponse. |

### Étape C-1 — Persister la compaction live (chemin IDE)

**But** : après compact RAM, le JSONL session sur disque = summary + tail (comme TUI).

| | |
|--|--|
| **Fichiers** | `agent/run/lifecycle.rs` (`maybe_snip` / post-compact) · éventuellement helpers type TUI `rewrite_transcript` (`drox-tui/.../commands.rs`) · handlers JSON-RPC reload |
| **Action** | Après `compact_until_budget` / `try_live_compact` réussi côté engine utilisé par JSON-RPC : **réécrire** le transcript session. Réutiliser la même primitive que le TUI si possible (éviter deux formats). |
| **Tests** | Compaction → taille fichier JSONL ↓ ; prochain `agent.run` recharge le transcript compacté (pas l’ancien plein). |
| **Done when** | Dogfood : event `ContextCompacted` suivi d’un 2ᵉ message user → pas de retour au JSONL pré-compact. |
| **Smoke** | Session longue → compact → nouveau prompt → jauge / taille historique cohérente. |

### Étape C-3 — Curseur `flush_transcript` après shrink

**But** : pas de trous assistant/tool_result après compaction.

| | |
|--|--|
| **Fichiers** | `lifecycle.rs` (flush + cursor) |
| **Action** | Après remplacement de `messages`, recalibrer `transcript_cursor` (0 ou réécriture complète). Vérifier qu’on n’écrit pas des tool_results orphelins. |
| **Tests** | Unit : shrink puis flush → JSONL lisible / paires tool cohérentes. |
| **Done when** | Couvert avec C-1 ; pas de session « cassée » post-compact. |

**Gate Vague 1** : ✅ L-1 + L-2 + C-1 (+ C-3) sur `1.6.0` · tests moteur verts · smoke dogfood S1/S2 à confirmer.

---

## Vague 2 — Contexte & tools

### Étape T-1 — Gros tool results → fichier

**But** : éviter overflow → compact → re-appel tool (boucle Cursor/Claude).

| | |
|--|--|
| **Fichiers** | dispatch / tools (`file_read`, shell, `task`/Explore, MCP si applicable) · éventuel helper « spill to `.drox/tool-outputs/` » |
| **Action** | Au-delà d’un seuil (ex. 32–64 KiB, à calibrer) : écrire le body sur disque, injecter dans le message tool un résumé + chemin + consigne `file_read`/`tail`. |
| **Tests** | Gros stdout mock → contenu prompt = pointeur, pas le blob. |
| **Done when** | Explore / gros bash ne doublent plus le contexte d’un coup. |
| **Smoke** | Tool volontairement volumineux → agent lit le fichier, pas de compact immédiat en boucle. |

### Étape L-tools — Hash tools global (progress-aware)

**But** : détecter `(tool_name, args)` répétés sur **tous** les tools, pas seulement bash/grep.

| | |
|--|--|
| **Fichiers** | `loop_detect.rs` · `drive.rs` |
| **Action** | Signature canonique JSON args ; soft warn puis hard (strip tool_calls ou abort). Si **même** call + **output qui change** → compter comme progrès (polling) ; échecs ≠ progrès (pattern Cline). |
| **Tests** | `file_read` identique ×3 → warn/stop ; poll avec output différent → continue borné. |
| **Done when** | Boucle `read_file` même range impossible jusqu’à `max_iterations`. |

### Étape G-1 — Jauge estimé vs provider

**But** : ne plus interpréter 78k→162k comme seul bug d’injection.

| | |
|--|--|
| **Fichiers** | stats UI Agents/IDE (`droxAgentsChatUiStatsService` ou équivalent) · évent. event TurnUsage |
| **Action** | Afficher deux valeurs ou un label clair : `estim.` vs `provider`. Ne pas écraser l’estimé sans indiquer la source. |
| **Done when** | Dogfood : on voit la bascule estimate→provider. |

### Étape C-2 — Aligner compact manuel session

| | |
|--|--|
| **Action** | `session.compact` / tool compact : même persistance que C-1. |
| **Done when** | Compact manuel réduit le JSONL durablement. |

**Gate Vague 2** : T-1 + L-tools + G-1 ; smoke Explore + gros tool OK.

---

## Vague 3 — Observabilité & polish

### Étape OBS-1 — Unlock debug en prod

| | |
|--|--|
| **Action** | Setting machine ou token (ex. `drox.debug.promptExport.unlock`) ; off par défaut en release. |
| **Done when** | Sans token : pas d’export ; avec token : export possible. |

### Étape OBS-2 — Export `messages[]` par itération

| | |
|--|--|
| **Action** | Sous `.drox/debug/` (ou équivalent) : un fichier par run/itération (roles, tailles, présence nudge). Redacter secrets si besoin. |
| **Done when** | Sur un run qui boucle encore, on peut ouvrir le dump et voir nudges / doublons. |

### Étape L-3 — Nudges sans faux `user` (optionnel)

| | |
|--|--|
| **Fichiers** | `drox-llm` openai/request.rs · ollama/stream.rs |
| **Action** | Pour providers qui acceptent plusieurs `system`, garder le nudge en system ; sinon conserver reminder mais après Vague 1. |
| **Done when** | Eval Ollama : moins de régénérations « déterministes » sur nudge. |

**Gate Vague 3** : OBS utilisable en dogfood prod unlock.

---

## Protocole de test dogfood (à chaque gate)

### Environnement
- Modèle : au moins un **local flash** (ex. GLM) + un second si possible.  
- Session : discussion **déjà longue** (plusieurs edits) ou script qui gonfle l’historique.

### Scénarios

| # | Scénario | Attendu après Vague 1 | Attendu après Vague 2 |
|---|----------|------------------------|------------------------|
| S1 | Modèle omet `done`, répète la même réponse | Stop ≤ 3 itérations | idem |
| S2 | Message user juste après compact | Pas de doublement JSONL | Jauge cohérente (G-1) |
| S3 | Boucle `file_read` même path/range | Partiel (L-2 si texte) | Stop via L-tools |
| S4 | Gros résultat tool / Explore | — | Spill fichier, pas explosion |

### Commandes utiles

```powershell
cd drox-engine/drox
cargo test -p drox-engine
# cibler les suites loop / compaction selon modules

cd ../..
npm run watch   # si UI G-1 / OBS
.\scripts\code.bat
```

---

## Critères de clôture 1.6.0

- [ ] Vague 1 mergée + smoke S1/S2 OK  
- [ ] Vague 2 mergée + smoke S3/S4 OK  
- [ ] OBS-1/2 disponibles pour dogfood  
- [ ] [DIAGNOSTIC](DIAGNOSTIC-BOUCLES-CONTEXTE.md) mis à jour « résolu / reporté »  
- [ ] `stable/1.6.0/RELEASE_NOTES.md` + `CLOSURE-1.6.0.md`  
- [ ] Ship win32 + linux `v1.6.0`

---

## Hors scope (ne pas faire dans ces étapes)

- Supprimer le protocole `[phase: done]`.  
- Refonte complète régulation / MEMORY.  
- MCP lazy discovery façon Cursor (backlog post-1.6.0 si besoin).  
- Fine-tune ou prompt géant anti-boucle sans garde runtime.

---

## Liens

- [README 1.6.0](README.md)  
- [PLAN-AGENT-LOOP-CONTEXT.md](PLAN-AGENT-LOOP-CONTEXT.md) (lots / IDs)  
- [DIAGNOSTIC-BOUCLES-CONTEXTE.md](DIAGNOSTIC-BOUCLES-CONTEXTE.md)
