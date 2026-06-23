# Patch WORK UI — smoke 1.5.3

**Version** : juin 2026  
**Branche** : `1.5.3`  
**Principe** : corrections **webview / fil linéaire uniquement** — pas de changement moteur Rust ni contrat RPC.

---

## Contexte

Smoke manuel du fil **WORK** (strip linéaire 1.5.1+) : plusieurs défauts visuels bloquants avant tag `v1.5.3`. Audit réalisé sur captures smoke (git pull, branche `0.0.0`, run fichier `plan.md`).

| # | Symptôme observé | Gravité |
|---|------------------|---------|
| W1 | Plan disparaît / réapparaît de façon erratique dans WORK | P0 |
| W2 | En-tête WORK sans compteurs (phases, shell, outils…) | P1 |
| W3 | Doublon du texte de phase Reasoning | P0 |
| W4 | Nouvelle question user → plan du **cycle précédent** réaffiché | P0 |
| W5 | Étapes du plan peu visibles « en direct » (clôture progressive) | P2 |
| W6 | Grille verte 3×3 encore animée après run terminé (WORK ouvert) | P0 |

---

## Cartographie des causes

### W1 — Plan instable

**DOM actuel** (`strip.js`) :

```text
drox-run-strip
  └─ details.drox-run-work-collapsible
       └─ .drox-run-chronology
            ├─ .msg-todos (Plan)
            ├─ .phase-block …
            └─ outils / diffs …
```

- Le Plan est **enfant du panneau repliable** WORK.
- `collapseRunWorkSection()` (`chronology.js`) met `work.open = false` à la phase `done`, à `busy: false` (`host-message.js`) et au scellement (`sealRunStrip`).
- Résultat : le Plan disparaît dès que WORK se replie — impression de clignotement.

**Code mort** : `archivePlanIntoStrip()` cherche `.drox-run-sticky-head [data-section="plan"]` — structure supprimée en 1.5.1. L’archive ne s’exécute jamais ; le CSS sticky plan (`.drox-run-sticky-head .msg-todos`) ne s’applique plus.

### W2 — Compteurs WORK absents

Le `<summary class="drox-run-work-summary">` est fixé à la chaîne `"Work"` (`strip.js` ~l.350). L’ancien rail `run-rail-stations.js` (1.5.0) a été retiré sans remplacement.

### W3 — Doublon Reasoning

Chaîne à chaque transition de phase :

1. `enterPhase()` (`phases.js`) appelle `flushStreamBuffer({ asAnswer: true })`.
2. Pendant le reasoning, le texte streamé vit dans `.drox-phase-line.streaming` via `appendStreamBufferDelta`.
3. Au flush avec `asAnswer: true` et phase ≠ `answering` :
   - `mountStreamPhaseLine` crée un **second** bloc (`variant: 'assistant'` → `.drox-chronology-assistant`).
   - L’ancien `.drox-phase-line` reste dans le DOM si le buffer n’était pas vide (`chronology.js` ~236–258).

→ Même paragraphe affiché deux fois sous des marqueurs `[Reasoning]`.

### W4 — Plan stale sur nouveau tour

| Étape | Fichier | Effet |
|-------|---------|--------|
| `todo_write` tour N | `todos.js` | `D.state.currentTodoBlockEl` → bloc Plan dans strip N |
| Nouveau message user | `strip.js` → `anchorRunStripAfterUser` | strip N scellé, strip N+1 créé |
| **Pas de reset** | `simple.js` → `resetChatStreamForTurn` | ne touche que `chatStreamEl` — pas `currentTodoBlockEl` |
| Reparent forcé | `reparentTodoBlockToPlan()` | **déplace** l’ancien Plan vers le chronology du strip N+1 |

Tant qu’aucun nouveau `todoUpdate` n’arrive, le plan du tour précédent reste visible.

### W5 — Clôture des étapes

- Le rendu supporte déjà `pending` / `in_progress` / `completed` (`todos.js`, CSS `.todo-done`).
- `highlightTodoTask()` (`orchestration.js`) existe mais **n’est appelé nulle part**.
- Si le moteur n’émet qu’un seul `todo_write` final tout en `completed`, l’UI ne peut pas animer l’avancement — à vérifier côté events avant tout patch moteur.

### W6 — Grille verte persistante

- Pendant le run : `showActivityOnSummary()` ajoute `.activity-grid` sur le summary outil/phase actif.
- À `busy: false` : `hideActivity()` ne retirait que `currentActivityGridEl` (une seule grille suivie).
- **Bug critique** : `finishToolBlock` / `finishShellCommandCard` copient `toolSummary.innerHTML` vers le tray → grille **figée en HTML** dans le résumé du tray, jamais nettoyée.

---

## Patch prévu

### W6 — Grille d’activité (✅ appliqué)

| Fichier | Changement |
|---------|------------|
| `chrome/activity.js` | `clearAllActivityGrids()` — retire toutes les `.activity-grid` d’un sous-arbre ; `hideActivity()` l’utilise |
| `stream/tools/logTools.js` | `stripActivityGridsFromElement` avant copie `innerHTML` → tray |
| `stream/tools/shellCard.js` | idem |
| `stream/timeline/strip.js` | `clearAllActivityGrids(strip)` dans `sealRunStrip` |
| `stream/timeline/chronology.js` | idem dans `collapseRunWorkSection` |
| `droxChatMvp.css` | `.drox-run-strip-sealed .activity-grid { display: none }` (filet sessions déjà rendues) |

**Smoke** : run terminé → ouvrir WORK → plus de carrés verts animés à côté des outils.

### Hotfix — scroll / empilement (régression longs runs)

**Symptômes** : dizaines de phases → fil ingérable, scroll bloqué, couches WORK superposées ; après run le user scroll mais le strip semble « fixe ».

**Causes** :
- `ensureRunStripConnected` ne repositionnait pas un strip déjà connecté (travail hors du strip visible)
- Plusieurs strips ouverts simultanés
- Chronologie sans `max-height` → `#log` trop haut, scroll cassé
- `body.drox-linear-run-active` persistant + sticky user mal calé

**Correctifs** : repositionnement strip, `pruneExtraOpenRunStrips`, scroll interne chronologie, `:has(+ .drox-run-strip)` sur sticky user, retrait classe body à `busy:false`.

---

**Symptôme** : strip WORK affiché mais chronologie vide ; le travail (outils, diffs) a eu lieu hors vue.

**Cause** : les events `tool` / `delta` peuvent créer le strip **avant** l’écho `append user`. `anchorRunStripAfterUser` interprétait ça comme un nouveau cycle, **scellait** le strip plein et créait un strip vide sous le message.

**Correctifs** (`strip.js`, `chronology.js`) :
- Repositionner le strip orphelin après le user (même run) au lieu de le sceller
- `getChronologyMount` : ne cible que le body de phase **dans le strip courant**
- WORK forcé `open` pendant `busy` ; reset stream chronology au nouveau cycle

---

### W4 — Reset plan au nouveau tour (✅ appliqué)

**Objectif** : chaque message user démarre avec un Plan vide jusqu’au prochain `todoUpdate`.

| # | Tâche | Détail |
|---|--------|--------|
| W4-1 | Reset état plan | Dans `anchorRunStripAfterUser` (ou helper `resetPlanStateForTurn`) : `currentTodoBlockEl = null`, `todoSnapshot = []` |
| W4-2 | Ne pas reparenter un plan scellé | `reparentTodoBlockToPlan` : ignorer si `block` est dans un strip `data-sealed="1"` ou si `block` ≠ plan du strip courant |
| W4-3 | Optionnel | Laisser le plan archivé dans le strip scellé (DOM) ; ne créer `.msg-todos` que sur `todoUpdate` |

**Fichiers** : `stream/timeline/strip.js`, `chrome/todos.js`, `core/state.js` (si centralisation reset).

**Critère** : question A (git pull) avec plan 2/2 → question B (nouvelle branche) → WORK de B **sans** les tâches barrées de A jusqu’à `todo_write` de B.

---

### W3 — Doublon Reasoning (✅ appliqué)

| # | Tâche | Détail |
|---|--------|--------|
| W3-1 | Flush phase correct | `enterPhase` : `flushStreamBuffer({ asAnswer: false })` sauf transition explicite vers `answering` |
| W3-2 | Un seul nœud texte | Dans `flushStreamBuffer` : si `.drox-phase-line` existe, **fusionner** le buffer dedans au lieu de `mountStreamPhaseLine` ; ou supprimer l’élément avant d’en créer un autre |
| W3-3 | Dédup défensive | Option : `dedupeIdenticalThinkingPanels` adapté aux blocs `.drox-phase-line` / `.drox-chronology-assistant` adjacents identiques |

**Fichiers** : `stream/timeline/phases.js`, `stream/timeline/chronology.js`.

**Critère** : run avec plusieurs phases Reasoning → chaque bloc de texte unique, pas de paragraphe dupliqué.

---

### W1 — Plan toujours visible (✅ appliqué)

**Option recommandée** (minimale, sans refonte strip) :

| # | Tâche | Détail |
|---|--------|--------|
| W1-1 | Plan hors replis | Déplacer `.msg-todos` **au-dessus** de `details.drox-run-work-collapsible` (frère direct dans `.drox-run-strip`) ou dans une zone sticky du summary WORK |
| W1-2 | WORK ouvert pendant run actif | Ne pas appeler `collapseRunWorkSection` tant que `D.state.busy` ; replier seulement après réponse finale ou sur strip scellé |
| W1-3 | Réparer archive | `archivePlanIntoStrip` : cibler `.msg-todos` dans la chronologie ou le nouveau emplacement sticky ; déplacer vers `.drox-run-plan-archive` au seal |
| W1-4 | CSS | Réaligner `.drox-run-sticky-head` ou nouveau sélecteur `.drox-run-strip > .msg-todos` |

**Fichiers** : `stream/timeline/strip.js`, `chrome/todos.js`, `droxChatMvp.css`.

**Critère** : pendant tout le run, le Plan reste visible (même si WORK est replié manuellement par l’utilisateur — option : Plan toujours hors `<details>`).

---

### W2 — Compteurs en-tête WORK (✅ appliqué)

| # | Tâche | Détail |
|---|--------|--------|
| W2-1 | `syncWorkSummaryStats(strip)` | Compter dans `.drox-run-chronology` : `.phase-block`, `.drox-shell-card`, `.msg-tool`, `.msg-file-change` |
| W2-2 | Mise à jour | Appels depuis `enterPhase`, `handleToolEvent`, `todoUpdate`, `sealRunStrip` |
| W2-3 | Libellé | Ex. `Work · 3 reasoning · 2 shell · 1 edit` (FR via `phase-labels.js` ou clés i18n) |

**Fichiers** : `stream/timeline/strip.js` (nouveau helper), `bridge/host-message.js`, `bridge/tool-events.js`, `droxChatMvp.css` (layout summary).

**Critère** : en-tête WORK reflète les compteurs en temps réel ; figés au seal.

---

### W5 — Avancement plan en direct (✅ partiel — `railStationEnter` → `highlightTodoTask`)

| # | Tâche | Détail |
|---|--------|--------|
| W5-1 | Audit events | Logger `todoUpdate` intermédiaires pendant smoke — le moteur envoie-t-il `in_progress` ? |
| W5-2 | Câbler highlight | Si events `role_enter` / task id existent côté shim : appeler `highlightTodoTask(taskId, 'running')` depuis `host-message.js` |
| W5-3 | Sans moteur | Si un seul `todo_write` final : documenter limite UX ; pas de faux progrès côté IDE |

**Fichiers** : `bridge/host-message.js`, `stream/messages/orchestration.js`, éventuellement `droxChatAgentEvents.ts` (lecture seule).

---

## Séquence d’implémentation

```text
W6 (grille) ✅
  → W4 (plan stale)     — rapide, gros impact smoke
  → W3 (doublon texte)  — lisibilité fil
  → W1 (plan visible)   — structure DOM
  → W2 (compteurs)      — polish
  → W5 (si events OK)   — optionnel
```

---

## Tests smoke (checklist)

- [x] **W4** : deux questions consécutives → plan B indépendant de A
- [x] **W3** : run multi-reasoning → pas de doublon de paragraphe
- [x] **W1** : plan visible pendant tout le run ; survit à la fin sans disparaître aléatoirement
- [x] **W2** : compteurs WORK cohérents avec le contenu du chronology
- [x] **W6** : WORK ouvert après run → pas d’animation grille verte
- [ ] **W5** : (si applicable) tâches passent `pending` → `in_progress` → `completed` avec icônes

---

## Fichiers touchés (récap)

| Zone | Fichiers |
|------|----------|
| Strip / seal | `stream/timeline/strip.js` |
| Phases / buffer | `stream/timeline/phases.js`, `stream/timeline/chronology.js` |
| Plan | `chrome/todos.js` |
| Activité | `chrome/activity.js` |
| Outils | `stream/tools/logTools.js`, `stream/tools/shellCard.js` |
| Bridge | `bridge/host-message.js`, `bridge/tool-events.js` |
| Styles | `droxChatMvp.css` |
| État | `core/state.js`, `stream/display/simple.js` |

**Hors scope** : `drox-engine/`, `drox-tui/`, shim RPC (sauf lecture events pour W5).

---

## Liens

- [PLAN-1.5.3.md](PLAN-1.5.3.md)
- [README 1.5.3](README.md)
- Fil linéaire 1.5.1 : [SMOKE-1.5.1-FIL-TUI](../1.5.1/SMOKE-1.5.1-FIL-TUI.md)
