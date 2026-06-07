# Prompts réinjectés — inventaire global (1.3.2, chat `role_split`)

> **OBSOLÈTE** — Inventaire pré-simplification (paliers / réinjection par gate). Référence : [CONDUCTEUR-CODE.md](CONDUCTEUR-CODE.md).

**Objectif** : repérer les doublons (même consigne dite 2–3 fois) et le moment où chaque bloc entre dans le contexte LLM.

---

## 1. Au démarrage d’un `agent.run` (une fois par run / sous-run)

| Bloc | Fichier source | Rôles | Redondance fréquente |
|------|----------------|-------|----------------------|
| **System prompt assemblé** | `drox-cli/.../assemble.rs` | Tous | Contient déjà règles + carte workspace |
| ↳ Gate probes | `GateEngine::system_prompt` + TOML `assets/gates/` | `ArchitectIntent` | Un prompt par gate (`entry`, `discuss.*`, …) — JSON uniquement |
| ↳ Discussion | `architect_discussion.rs` | `ArchitectDiscussion` | + `droxignore` + workspace map (+ langue) |
| ↳ Edit | `architect_edit.rs` | `Architect` | + memdir + sessions + skills + map + langue + thinking |
| ↳ Executor | `executor.rs` | `Executor` | Supplément rôle + delegate block |
| **Message user initial** | `architect_*_user_message` / RPC `prompt` | Par chemin | **Doublon** avec sticky UI / export « User request » |
| ↳ Gate probe user | `architect_gate_user_message` | Intent | `## User` + message sanitize |
| ↳ Discussion user | `architect_discussion_user_message` | Discuss | Une ligne outils (évite paragraphe « Reminder ») |
| ↳ Edit user | `architect_messages.rs` | Edit | Rappel map/plan/outils (**redondant** avec `ARCHITECT_SYSTEM_PROMPT`) |

**Pipeline `role_split`** : 2 messages user possibles dans le transcript si intent + discuss/edit sont tous deux journalisés (intent puis run principal).

---

## 2. Pendant la boucle agent (`loop.rs`)

| Bloc | Quand | Rôles | Problème observé |
|------|-------|-------|------------------|
| **Ancre cycle architecte** | Après compaction, délégation, todo | `Architect` | User request + plan + checkpoint — **nécessaire** |
| **Checkpoint délégation** | Après chaque `delegate_executor` | `Architect` | Recovery / sanity — peut cumuler avec ancre |
| **`run_objective`** | Si objectif run actif | Architecte | Rare |
| **Nudge tour vide** | Pas de tool, pas `[phase: done]` | Tous | **Boucle discussion** si seuil promo = 120 car (corrigé → 12 car en discuss) |
| ↳ `ARCHITECT_DISCUSSION_NUDGE` | Discuss | « Déjà répondu — stop » | Remplaçait par « continue / outils » |
| ↳ `ARCHITECT_NUDGE` | Edit | Cycle complet | Long |
| ↳ `ARCHITECT_INTENT_GATE_NUDGE` | Intent | Gate manquante | OK |
| **Nudge anti-boucle** | 2 tours identiques | Tous | Générique |
| **Gates todo / map / sanity** | Après outils | `Architect` | Messages d’erreur + next action — **ne doit pas** s’appliquer en discuss |
| **Compaction checkpoint** | Contexte trop long | Tous | Remplace historique + réinjecte ancre |
| **Explore jobs pending** | Sous-agents explore | Standard / Architect | Legacy |

---

## 3. Suppléments conditionnels (assemble / loop)

| Supplément | Condition |
|------------|-----------|
| `language.rs` merge | Toujours (langue réponse user) |
| `NATIVE_THINKING_REASONING_SUPPLEMENT` | `native_thinking` |
| `disabled_tools_notice` | Outils désactivés côté IDE |
| `EXECUTOR_ROLE_SUPPLEMENT` | Run executor |
| `droxignore` | Presque tous les runs |
| **Workspace map** | System + souvent déjà dans ancre |

---

## 4. Redondances prioritaires à traiter (backlog)

1. **Edit** : `ARCHITECT_SYSTEM_PROMPT` + message user « map → plan → delegate » + nudge architecte → même ordre 3×.
2. **Discussion** : anciennement memdir + sessions + skills en plus du prompt discussion (retiré en 1.3.2).
3. **Export chat** : label « Architect reminder » sur tout `## Reminder` — confond intent/discuss/edit dans les exports.
4. **Intent** : carte workspace dans le tour intent (utile pour intention, alourdit le tour 0).

---

## 5. Correctifs 2026-06-02 (dogfooding `chat.txt`)

- Seuil promotion réponse : **12 caractères** en `ArchitectDiscussion` (vs 120 ailleurs).
- Clôture discuss : tour **sans outil** + texte utilisateur suffisant → `Stop` immédiat.
- Prompts user allégés (`## User` + une parenthèse).
- Nudge discuss : « déjà répondu — stop ».

---

## 6. Suite produit

Registre paramétrable : [10-parametrage-prompts-strictesse.md](../../feature-brainstorm/10-parametrage-prompts-strictesse.md) (IDs **A1** / **A2** seuils clôture, gates **D***, nudges **B***, prompts **G*** / **H***).

---

## 7. Références code

- Assemblage : `drox-cli/src/system_prompt/assemble.rs`
- Nudges : `drox-engine/src/agent/nudges/`
- Boucle : `drox-engine/src/agent/loop.rs`
- Ancre : `drox-engine/src/agent/architect_state.rs` (`cycle_anchor_block`)
- Orchestration : `drox-cli/.../orchestration_run.rs`
