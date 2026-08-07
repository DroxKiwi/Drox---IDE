# 1.5.19 — Moteur LLM Ollama + LoopDetector (thinking / KAT-Coder)

**Version** : `droxVersion` **1.5.19** · **Date** : 2026-08-07  
**Périmètre** : crates Rust `drox-llm`, `drox-engine` (`agent.rs`).  
**Compagnon** : gates bash / todo / testing → [ENGINE-RUST-AGENT-LOOPS.md](ENGINE-RUST-AGENT-LOOPS.md).

**But** : documenter avec précision les correctifs moteur issus des smokes **KAT-Coder (GGUF / Ollama)** — schéma d’outils, ordre des messages `system`, faux positifs anti-boucle pendant la phase *thinking*.

---

## Contexte produit (symptômes)

| # | Symptôme utilisateur | Cause racine moteur |
|---|----------------------|---------------------|
| S1 | `400` Ollama : `JSON schema conversion failed: Error resolving ref #/definitions/EditOp` (et `TodoItem`, `NotebookCellEdit`, …) — **uniquement** sur certains GGUF | `schemars` émet des `$ref` → `#/definitions/…` ; le convertisseur de template Ollama de ce modèle ne résout pas `definitions` |
| S2 | `500` Jinja : `System message must be at the beginning` en cours / après thinking | Drox envoie plusieurs `system` (prompt + objectif + nudges mid-run). Le template n’autorise qu’un `system` en **première** position |
| S3 | Run coupé : *« the model kept looping despite automatic re-framing »* alors que le modèle analyse encore (thinking + retries `todo_write` JSON) | `LoopDetector` hashait **seulement** `text` + `tool_calls`. Le thinking natif était **hors empreinte** → texte vide + même `todo_write` cassé = « boucle » |

---

## Fichiers Rust touchés

| Crate / chemin | Rôle |
|----------------|------|
| `drox/crates/drox-llm/src/schema.rs` | **Nouveau** — `inline_json_schema_refs` (aplatit `$ref` / `definitions` / `$defs`) |
| `drox/crates/drox-llm/src/lib.rs` | Expose le module `schema` |
| `drox/crates/drox-llm/src/ollama/protocol.rs` | `ChatToolSpecFunction.parameters` : `Value` owned (post-inline) |
| `drox/crates/drox-llm/src/ollama/stream.rs` | Wire Ollama : inline schémas outils + `normalize_system_messages_for_ollama` |
| `drox/crates/drox-engine/src/agent.rs` | `TurnOutcome.thinking` · empreinte LD · seuil Warn×2 · reset strike sur `InvalidArgs` |

---

## Change log détaillé

### E16 — Inline des JSON Schema d’outils avant `/api/chat` (Ollama)

**Fichiers** : `drox-llm/src/schema.rs`, `ollama/stream.rs`, `ollama/protocol.rs`

**Avant**  
Les tools (`file_edit`, `todo_write`, `notebook_edit`, …) exposent `schemars::schema_for!(…)` tel quel :

```json
{
  "type": "object",
  "properties": { "edits": { "items": { "$ref": "#/definitions/EditOp" } } },
  "definitions": { "EditOp": { … } }
}
```

Ollama reçoit ce schéma dans `tools[].function.parameters`.  
Sur **KAT-Coder** (et certains GGUF), la conversion de template échoue : *Error resolving ref #/definitions/…*.  
Les modèles Ollama « classiques » digéraient souvent le même payload → symptôme **modèle-spécifique**.

**Après**  
Avant construction du `ChatRequest` Ollama :

1. `inline_json_schema_refs(&parameters)` remplace récursivement `#/definitions/X` et `#/$defs/X`.
2. Retire `$schema`, `definitions`, `$defs` du root.
3. Garde-fou profondeur 32 (schémas mutuellement référencés).
4. `parameters` est une `Value` **owned** (plus de `&Value` empruntée au `ToolSpec`).

**But**  
Rendre le wire tools compatible avec les templates Ollama stricts, sans changer le contrat Rust des tools ni le runtime d’exécution.

**Tests** (`cargo test -p drox-llm --lib schema`)

| Test | Assert |
|------|--------|
| `inlines_definitions_ref` | `$ref` EditOp → objet inline ; plus de `definitions` / `$schema` |
| `leaves_plain_schema_untouched` | Schéma déjà plat inchangé |

**Validation manuelle**  
Nouveau chat + modèle KAT-Coder → premier message sans `400 JSON schema conversion failed`.

---

### E17 — Normalisation des messages `system` (templates Jinja stricts)

**Fichier** : `drox-llm/src/ollama/stream.rs` — `normalize_system_messages_for_ollama`

**Avant**  
`build_request` mappe 1:1 les `Message` Drox → wire Ollama. Or le moteur injecte :

- `system` prompt (tête)
- éventuellement `system` objectif de run
- plus tard : nudges `system` (`LOOP_DETECTED_NUDGE`, unfinished todos, phase gates, …)

Templates du type KAT-Coder :

```jinja
{% if message.role == 'system' and not loop.first %}
  {{- raise_exception('System message must be at the beginning.') }}
{% endif %}
```

→ `500` dès qu’un nudge mid-run est sérialisé en `role: system`.

**Après**

1. Fusion de **tous** les `system` **de tête** (avant le premier non-system) en **un seul** message initial (`\n\n`).
2. Tout `system` ultérieur → `role: user` avec préfixe `[System reminder]\n…`.
3. Appliqué dans `build_request` après `message_to_wire`.

**But**  
Respecter le contrat Jinja sans désactiver les nudges moteur (ils restent dans le transcript, sous forme user reminder).

**Tests** (`cargo test -p drox-llm --lib coalesce_leading`)

| Test | Assert |
|------|--------|
| `coalesce_leading_systems_and_rewrite_mid_conversation_system` | 2 system de tête → 1 ; system mid-run → `user` + `[System reminder]` ; exactement 1 `system` dans le payload |
| `normalize_system_only_leading_empty_skipped` | System vide de tête omis |

**Validation manuelle**  
Après une phase thinking + nudge éventuel → plus de `System message must be at the beginning`.

---

### E18 — LoopDetector : thinking dans l’empreinte + tolérance format

**Fichier** : `drox-engine/src/agent.rs`

#### E18a — Empreinte = texte + **thinking** + tools

**Avant**  
`observe` hashait `outcome.text` + `tool_calls`.  
Les deltas `ThinkingDelta` (Ollama `message.thinking`) n’étaient **pas** stockés dans `TurnOutcome` (seulement relayés à l’UI si `think: true`).

Conséquence KAT-Coder :

- Travail visible = long thinking
- Contenu « assistant » wire souvent vide / court
- Retries `todo_write` avec JSON invalide → même empreinte tools + texte vide  
→ Warn puis **Abort** alors que le modèle progresse encore.

**Après**

1. `TurnOutcome.thinking: String` — accumulé sur **chaque** `ThinkingDelta` (même si l’UI n’affiche pas le thinking).
2. `text_h = combine(hash(text), hash(thinking))`.
3. Tour « vide » = texte **et** thinking vides **et** pas d’outils.

**But**  
Ne plus confondre « réflexion en cours + même tentative d’outil » avec une boucle stérile.

**Tests**

| Test | Assert |
|------|--------|
| `loop_detector_treats_different_thinking_as_progress` | Même `todo_write` + thinking différent → `Ok` ; répétition thinking+tools → `Warn` |

#### E18b — Seuil Abort assoupli

**Avant** : 1er strike → `Warn` ; 2e → `Abort` (3e tour identique).  
**Après** : strikes `1` et `2` → `Warn` ; strike `≥ 3` → `Abort` (4e tour identique).

**But**  
Laisser une marge aux retries JSON / re-frame avant coupure dure.

**Tests mis à jour** : `repeated_assistant_text_triggers_loop_detected_after_nudge`, `loop_detector_resets_when_intermediate_turn_differs` — scripts LLM avec **4** tours identiques (au lieu de 3).

#### E18c — Reset strike après `ToolError::InvalidArgs`

**Avant**  
Échec `todo_write` (JSON invalide) → message d’erreur au modèle, mais le `LoopDetector` gardait strike + empreinte → enchaînement rapide Warn → Abort.

**Après**  
Sur `Err(ToolError::InvalidArgs(_))` (chemins parallèle **et** série) : `loop_detector.reset()` (strike = 0, empreinte conservée comme les autres resets structurels).

**But**  
Un feedback format **nouveau** ne doit pas brûler immédiatement le budget anti-boucle.

---

## Schéma (après E16–E18)

```text
Agent tour → ToolSpec.parameters (schemars, peut contenir $ref)
                │
                ▼
         Ollama build_request
         ├─ E16 inline_json_schema_refs(parameters)
         └─ E17 normalize_system_messages_for_ollama(messages)
                │
                ▼
         POST /api/chat  (template Jinja modèle)
                │
                ▼
         consume_stream
         ├─ text (phases retirées)
         └─ thinking (accumulé)     ──┐
                │                     │
                ▼                     │
         LoopDetector.observe  ◄──────┘  E18a
         ├─ Warn ×2 max              E18b
         └─ InvalidArgs → reset      E18c
```

---

## Rebuild / validation

Depuis `drox-engine/drox` :

```powershell
cargo test -p drox-llm --lib schema
cargo test -p drox-llm --lib coalesce_leading
cargo test -p drox-engine --lib loop_detector
cargo test -p drox-engine --lib repeated_assistant_text
cargo build -p drox-cli
```

Puis **Reload Window** IDE (dev : priorise `target/debug/drox.exe`).

### Smoke manuel (KAT-Coder / Ollama)

1. **E16** — Nouveau chat → « Salut » → pas de `400` schema `$ref`.  
2. **E17** — Laisse le modèle penser / lire des fichiers → pas de `500` *System message must be at the beginning*.  
3. **E18** — Analyse de workspace avec retries `todo_write` mal formés → le run **ne doit pas** abort au 2e–3e essai si le thinking évolue ; abort seulement si **même** thinking+texte+tools se répètent 4 fois.

---

## Annexe — Hors Rust (même session produit)

| Zone | Changement | Lien |
|------|------------|------|
| Handoff Agents → IDE (`droxIdeSessionHandoff`, `vscodeActions`, Native Chat) | One-shot `ses_*` via `APPLICATION_SHARED` | Hors cette fiche (workbench) |
| Soft-timeout `chatEditingSessionIsReady` (3 s) | IDE TS | `chatServiceImpl.ts` |
| Clean `*.tsbuildinfo` / retry EPERM gulp | Build Windows | `build/gulpfile.extensions.ts` |

---

## Historique lié

| Version | Fiche | Lien |
|---------|-------|------|
| 1.5.19 | Gates bash / LoopDetector clôture | [ENGINE-RUST-AGENT-LOOPS.md](ENGINE-RUST-AGENT-LOOPS.md) |
| 1.5.14 | LoopDetector × plan | [IMPLEMENTATION-L1-LOOP-DETECTOR.md](../1.5.14/IMPLEMENTATION-L1-LOOP-DETECTOR.md) |
| 1.5.17 | Thinking fold UI | [amb/AMB-09-phases-thinking-fold.md](../1.5.17/amb/AMB-09-phases-thinking-fold.md) |
