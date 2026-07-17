# Trace moteur Rust — 1.5.16 (FX-B P0)

**Périmètre Rust de ce patch** : gate **intent-only write** dans la boucle agent.  
**FX-A P0** : IDE uniquement (pas de diff Rust ici).

> Document de travail pré-clôture : à figer au ship (hash commit + lignes).

---

## 0. Synthèse

| Crate | Fichiers | Nature |
|-------|----------|--------|
| `drox-engine` | `agent.rs`, `error.rs` (doc) | Nudge / soft-abort prose write sans `tool_calls` |

| Non touché | Pourquoi |
|------------|----------|
| `drox-cli` / prompts / tools FS | Pas de nouveau tool ni flag RPC |
| `drox-permissions` | Allow/ask/deny inchangé |
| Empreinte `LoopDetector` | Inchangée ; la gate FX-B s’exécute **avant** `observe` |

**Comportement hors intent write** : inchangé (nudge générique / LD / done gates).

---

## 1. `agent.rs` — gate FX-B

### Déclencheur

- `tool_calls` vide
- ET texte assistant matchant `assistant_text_suggests_mutation_intent` (aiguilles FR/EN + mention `file_write` / `file_edit`)
- OU compteur `consecutive_intent_only_write_nudges > 0` (sticky jusqu’à tool ou autre sortie)

### Escalade

| Strike | Action |
|--------|--------|
| 1 | `INTENT_ONLY_WRITE_NUDGE_PROMPT` |
| 2 | `INTENT_ONLY_WRITE_EXAMPLE_NUDGE_PROMPT` |
| \> 2 (`MAX=2`) | `EngineError::LoopDetected { kind: "intent_only_write", turns }` |

### Ordre dans la boucle

Évalué **avant** `loop_detector.observe` : sinon un 2ᵉ tour de prose identique déclenchait `Warn`/`Abort` générique (`kind: "both"`) et court-circuitait les nudges dédiés.

### Reset compteur

- Tour avec tools → 0  
- Nudge `DONE_ONLY` / `NUDGE_PROMPT` générique → 0  

---

## 2. Effets de bord possibles

| Risque | Mitigation |
|--------|------------|
| Faux positif sur « je vais lire / I will read » | Needles centrés write/edit/create fichier + noms d’outils mutateurs |
| Soft-abort trop tôt | 2 nudges avant abort ; le modèle peut encore émettre un tool |
| Double couverture LD | Intent path ne passe plus par LD ; LD reste pour les tours avec tools / prose non-intent |

---

## 3. Tests

- `mutation_intent_detector_fr_en`
- `intent_only_write_prose_aborts_after_nudges` (3× prose scriptée → `intent_only_write`)
