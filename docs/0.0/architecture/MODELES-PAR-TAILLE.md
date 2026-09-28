# Architecture — modèles par taille (Low / Medium)

**Date** : 2026-05-20  
**Statut** : conception  
**Objectif** : offrir au pied du composer des **profils modèle** comparables aux vignettes de mode (Default, Accept Edits…), avec des **prompts**, **outils** et **garde-fous** adaptés à la fenêtre de contexte réelle (**16k–64k** tokens côté utilisateur).

**Documents liés** : [PLAN-MODELES-TIER](../plans/PLAN-MODELES-TIER.md) (suivi d’exécution) · [REFACTO-STRUCTURE-CODE](../plans/REFACTO-STRUCTURE-CODE.md) · [MEMOIRE-LONG-TERME](./MEMOIRE-LONG-TERME.md) · [GUIDE-MOTEUR-DROX](../guides/GUIDE-MOTEUR-DROX.md)

---

## 1. Problème

Aujourd’hui un seul `CORE_SYSTEM_PROMPT` (+ suppléments langue / thinking) cible des modèles **medium** (~13b–33b) capables de :

- respecter le protocole de phases ;
- enchaîner plusieurs tool_calls ;
- tenir un plan `todo_write` cohérent.

Un modèle **low** (4b–13b) sur 16k–32k contexte :

- oublie les marqueurs `[phase: …]` ;
- « simule » des tools en JSON dans le texte ;
- sature le prompt avec mémoire markdown ;
- boucle ou termine sans `[phase: done]`.

**Il faut deux architectures d’exécution**, pas seulement deux noms de modèle Ollama.

---

## 2. UX — vignettes « Model tier »

### 2.1 Placement

À côté (ou sous) les vignettes `agent-vignettes` (`default` | `plan` | `acceptEdits` | `bypassPermissions`), ajouter un second radiogroup :

| Vignette | Id | Fourchette indicative | Icône / label |
|----------|-----|----------------------|---------------|
| Low | `low` | 4b–13b | « Fast » / éclair |
| Medium | `medium` | 13b–33b | « Standard » (défaut actuel) |

**Persistance** : `localStorage` `drox.modelTier` + setting `nexus.drox.modelTier` (enum).

### 2.2 Lien avec le modèle Ollama

- Le tier choisit le **profil d’exécution** (prompt + tools + gates).
- Le **nom du modèle** reste `nexus.drox.model` / `OLLAMA_MODEL` — optionnel : presets suggérés par tier dans les settings (ex. low → `qwen2.5:7b`, medium → `qwen2.5:14b`).

---

## 3. Contrat JSON-RPC

Étendre `agent.run` :

```json
{
  "modelTier": "low" | "medium",
  "model": "qwen2.5:7b",
  "permissionMode": "acceptEdits",
  "nativeThinking": false
}
```

**Défaut** : `medium` (comportement actuel).

Le handler fusionne : `system = base + language + tier_supplement(tier) + permission_supplement + native_thinking`.

---

## 4. Profil **Medium** (référence actuelle)

| Aspect | Comportement |
|--------|----------------|
| Prompt | `CORE_SYSTEM_PROMPT` complet |
| Phases | Toutes (`analyzing`, `reading`, `planning`, `acting`, `testing`, …) |
| Outils | Catalogue complet |
| `todo_write` | Fortement recommandé, nudge soft |
| Exploration | Libre read-only avant plan |
| Mémoire | Listing sessions + memdir ( jusqu’à refonte [MEMOIRE-LONG-TERME](./MEMOIRE-LONG-TERME.md) ) |
| Thinking natif | Optionnel (`think: true`) |

**Aucun changement fonctionnel** tant que `modelTier === "medium"`.

---

## 5. Profil **Low** — exosquelette d’accompagnement

> **Suivi détaillé (M4+)** : [PLAN-PROFIL-LOW-ACCOMPAGNEMENT](../plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md)  
> **Leviers M0–M3 (outils, prompt de base, UX)** : [PLAN-MODELES-TIER](../plans/PLAN-MODELES-TIER.md)

### 5.1 Principes (vision 2026-05-20)

Le petit modèle n’est **pas** bridé sur l’ambition des tâches (refacto long, audit repo, etc.). La différence avec Medium, c’est la **cohérence sur la durée** : le moteur **porte le fil** à sa place.

| Principe | Medium | Low |
|----------|--------|-----|
| **Objectif produit** | Perf équivalente **adaptée au setup** (VRAM / latence), pas « petit < gros » en bench | Idem — **plus** d’aller-retours moteur ↔ modèle |
| **Autonomie** | Forte (ex. 27b) — moteur **léger** | Faible sur le long — moteur **fort** |
| **Tâches longues** | Plan + phases, modèle se recadre | `RunContext` + **checkpoints** post-outil + plan forcé si multi-étapes |
| **VRAM** | Plus élevée | Moindre → marge **contexte** + futurs sous-agents |

**Déjà en place (M0–M3)** :

1. Registre réduit + **1 outil / tour** (pas un plafond de chantier — un pas atomique pour checkpoint).
2. `LOW_MODEL_SUPPLEMENT` + omission listing mémoire/skills dans le prompt.
3. `max_todo_items` = 5, nudges courts, gates phase tool.

**Cible M4+** (voir plan accompagnement) :

4. **`RunContext`** persistant (objectif verrouillé, étape plan courante, dernier outil).
5. **4 modes** (`Explore`, `Execute`, `Verify`, `Respond`) mappés depuis les `[phase: …]` existantes → oeillères outils.
6. **Re-perspective** après chaque outil : menu (`continue`, `execute`, `verify`, `plan`, `respond`, …) — le modèle choisit.
7. **Cap** + **plan** (`todo`) + **mode** : trois axes distincts (détail [PLAN-PROFIL-LOW-ACCOMPAGNEMENT](../plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md) §2.2–2.3).
8. Plan multi-étapes **recommandé** (nudge), pas imposé.
9. **`task`** : optionnel + recommandé en **M5+** (après M4 stable).

### 5.2 Outils autorisés (V1 proposée)

| Autorisé | Masqué en low |
|----------|----------------|
| `file_read`, `glob`, `grep` | `task`, `web_fetch`, `web_search` |
| `file_edit`, `file_write` | `notebook_edit` (optionnel V2) |
| `bash` (lecture / check uniquement — classifier strict) | `lsp` (optionnel : garder diagnostics only) |
| `todo_write` (max 5 items) | `session_compact`, `course_plan_write` |
| `ask_user_question` | sous-agents |

### 5.3 Prompt & boucle Low (esquisse)

- **M2 (actuel)** : `LOW_MODEL_SUPPLEMENT` en fin de stack (core Medium inchangé).
- **M4 (cible)** : `LOW_CORE_SYSTEM_PROMPT` dédié + messages **checkpoint** injectés par `RunContext` (le contexte vit dans le moteur, pas dans un prompt de 100 lignes).
- Règles inchangées : tool_calls natifs uniquement ; notes internes en anglais ; réponse utilisateur dans `[phase: answering]`.

### 5.4 Implémentation moteur (état 2026-05-20)

Autorité unique : `drox-engine/src/run_profile/policy.rs` (`RunProfileId`, `RunPolicy`, `LOW_TOOL_ALLOWLIST`).

| Couche | Low (implémenté) |
|--------|------------------|
| Prompt | `assemble_low` — pas de listing mémoire/skills ; `LOW_MODEL_SUPPLEMENT` |
| Registry | `prune_registry_to_policy` ; pas de MCP / `task` |
| Boucle | `enforce_max_tools_per_turn` (= 1) |
| Gates | Message phase court ; `max_todo_items` = 5 ; nudges via `nudge_prompt()` |

Détail et suivi : **[PLAN-MODELES-TIER](../plans/PLAN-MODELES-TIER.md)**.

- `build_tool_registry(profile, permission_mode)` filtre les `ToolSpec`.
- `agent.rs` / `gates.rs` lisent `AgentConfig.model_profile`.

### 5.5 UI

- Badge discret dans le composer : « Low model profile » quand tier = low.
- Warning si `OLLAMA_MODEL` ressemble à un 70b+ avec tier low (mismatch).

---

## 6. Roadmap

> Détail des phases, leviers et cases à cocher : **[PLAN-MODELES-TIER](../plans/PLAN-MODELES-TIER.md)**.

| Étape | Livrable |
|-------|----------|
| M0 | ✅ Scaffold `modelTier` + parité Low/Medium (aucune diff fonctionnelle) |
| M1 | ✅ Allowlist + 1 tool/tour + prune registre |
| M2 | ✅ `LOW_MODEL_SUPPLEMENT` + omit memory/skills + todo≤5 + nudges courts |
| M3 | ✅ Vignettes Fast/Standard + `nexus.drox.modelTier` + badge Low |
| M4 | Accompagnement Low ([PLAN-PROFIL-LOW-ACCOMPAGNEMENT](../plans/PLAN-PROFIL-LOW-ACCOMPAGNEMENT.md)) + [MEMOIRE-LONG-TERME](./MEMOIRE-LONG-TERME.md) |

---

## 7. Hors scope V1

- Tier **High** (33b+, multi-agent massif) — rester sur medium.
- Routing automatique low/medium selon la tâche (classifier) — manuel utilisateur d’abord.
- Modèles cloud propriétaires — Ollama-first inchangé.

*KDDS Nexus — Medium = autonomie actuelle (inchangée) ; Low = exosquelette de cohérence pour petites configs 12–24 Go VRAM.*
