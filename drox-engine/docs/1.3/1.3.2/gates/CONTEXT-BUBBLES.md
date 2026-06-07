# Spécification — Context bubbles (bulles de contexte)

## 1. Problème

Aujourd’hui le contexte est surtout **push** : transcript, system monolithique, snapshots répétés → le modèle « voit » du bruit (reminder legacy, map entière) et il reste peu de place pour le **code** pertinent.

**Objectif** (ex. fenêtre 132k tokens) :

| Pool | Budget cible (indicatif) | Contenu |
|------|--------------------------|---------|
| **Narrative** | ~50k | user, gates, plan, synthèses, historique **sur demande** |
| **Code** | ~70k | extraits fichiers, grep, lsp, cartes **ciblées** |
| **Marge** | reste | tour courant, tool results du step |

Les chiffres sont des **plafonds configurables** (`EngineTuning`), pas des constantes.

---

## 2. Qu’est-ce qu’une bulle ?

Une **bulle** = fonction pure (côté moteur) :

```text
BubbleId + BubbleParams → BubbleResult { text, tokens_estimated, category }
```

- **`category`** : `narrative` | `code` | `meta` (pour le budget allocator).
- Le résultat est **mis en cache** par tour (`run_id`, `bubble_id`, params hash) dans le journal.

### Fichier `bubbles/*.bubble.toml`

```toml
id = "last_user_message"
version = 1
category = "narrative"
description = "Last sanitized user message for this run."

[params]
# aucun

[limits]
max_chars = 8_000

[source]
type = "engine"
handler = "last_user_message"   # match Rust ContextBubbleHandler
```

```toml
id = "historic"
category = "narrative"
description = "Recent session transcript (compact)."

[params]
turns = { type = "u32", default = 6, max = 40 }

[limits]
max_chars = 24_000

[source]
handler = "session_transcript_compact"
```

```toml
id = "last_gate"
category = "narrative"
handler = "last_gate_pass"

[source]
id = "full_repository_context"
category = "code"
handler = "workspace_map_snapshot"   # pas tout le JSON brut si 105 nœuds — résumé ou préfixe
limits.max_chars = 32_000
```

---

## 3. Registre & appel code

```rust
// Conceptuel
trait ContextBubbleResolver {
    fn resolve(&self, id: BubbleId, params: &Value, ctx: &RunContext) -> BubbleResult;
}

// Usage dans assemble gate ou run
let text = bubbles.resolve("historic", json!({ "turns": 6 }), &ctx)?.text;
```

**Équivalent produit** de tes exemples :

| Appel conceptuel | `bubble.id` | Handler |
|------------------|-------------|---------|
| `call historic()` | `historic` | Transcript session compacté N tours |
| `call last_gate()` | `last_gate` | Dernière entrée `gate_pass` du journal |
| `call last_user_message()` | `last_user_message` | Premier/dernier user sanitized |
| `call full_repository_context()` | `full_repository_context` | Carte workspace **résumée** (pas dump JSON brut systématique) |

Les gates référencent des bulles par **id** dans `[context].bubbles = [...]`.

---

## 4. Journal architecte (inventaire moteur)

Inspiré des livrables `.drox/agent-output/<plan_id>/<task>/` :

```text
.drox/runs/<run_id>/
  journal.jsonl          # événements structurés
  gates/                 # copies optionnelles des réponses gate
  narrative/             # synthèses markdown générées par le moteur
```

### Ligne `journal.jsonl` (exemples)

```json
{"t":"gate_pass","gate":"entry","open":"architect_discuss","ts":"…"}
{"t":"bubble_resolve","id":"historic","chars":4200,"category":"narrative"}
{"t":"tool","name":"workspace_map_read","blocked":true,"reason":"e_none"}
{"t":"delegate","task_id":"t1","status":"completed"}
```

**Rôle** :

- Reconstruire `last_gate()` sans relire tout le transcript.
- UI debug : chemin `entry → discuss → needs_repo_facts=false`.
- Compaction : résumer le journal en markdown (`narrative/run-summary.md`) quand le budget narrative dépasse 50k.

Le modèle **n’écrit pas** le journal ; le moteur l’écrit (comme les statuts todo côté engine).

---

## 5. Assembleur de contexte (tour LLM)

```text
ContextAssembler::for_gate(gate_def, ctx)
  → pour chaque bubble_id dans gate_def.context.bubbles:
       resolve + respecter BudgetPool.narrative cap
  → rendre section markdown unique ### Context

ContextAssembler::for_run(run_kind, tier, ctx)
  → bulles run_snapshot, plan, last_delegate, …
  → NE PAS ré-injecter le menu des gates ENTRY
```

**Règle** : une gate passée ne re-envoie pas son prompt complet au run suivant — seulement `last_gate` (résumé 1–2 lignes) si le palier l’autorise.

---

## 6. Outil LLM `context_bubble_read` (phase 2)

Pour que l’architecte **tire** une bulle en milieu de run (pull) :

```json
{ "bubble": "historic", "params": { "turns": 10 } }
```

Même registre que l’assembleur ; compté dans le pool narrative.

---

## 7. Avis design

| Idée | Verdict |
|------|---------|
| Gates en fichiers + `GateEngine::evaluate` | **Oui** — produit lisible, testable, évolutif |
| Bulles adressables + budget narrative/code | **Oui** — seule façon scalable sur 132k |
| Journal JSONL moteur | **Oui** — aligné agent-output executor |
| `full_repository_context` = map JSON brute | **Non** en MVP — toujours **résumé** + `path_prefix` |
| Tout modéliser en gates dès v1 | **Non** — ENTRY + 2–3 booléens discuss/edit suffisent |

---

## 8. Questions ouvertes

- Bulles en TOML workspace vs embarquées repo ?
- i18n : `question.en` + `question.fr` ou langue unique EN pour gates ?
- Synchroniser `GatePath` avec l’export chat UI ?
