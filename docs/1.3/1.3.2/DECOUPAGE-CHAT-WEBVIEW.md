# Suivi — découpage chat webview (`droxChat/`)

**Version** : 1.3.2  
**Code** : `src/vs/workbench/contrib/drox/browser/media/droxChat/`  
**Chargement** : `DROX_CHAT_SCRIPT_FILES` dans `droxChatWebview.ts`

---

## Objectif

Découper les modules volumineux **par responsabilité**, sans changer le comportement. Si une responsabilité dépasse ~400–500 lignes, la placer dans un **sous-dossier** dédié.

---

## Inventaire initial (fichiers volumineux)

Mesure au démarrage du découpage (lignes approx., après regroupement mécanique racine).

| Priorité | Fichier (avant découpe) | Lignes | Ko | Statut |
|----------|-------------------------|--------|-----|--------|
| P0 | ~~`stream/07-log.js`~~ | ~~3 185~~ | ~~107~~ | **Fait** → 19 modules sous `stream/` (voir phase 1) |
| P1 | ~~`stream/07b-runTimeline.js`~~ | ~~1 055~~ | ~~36~~ | **Fait** → `stream/timeline/*` (5 modules) |
| P2 | ~~`core/00-context.js`~~ | ~~632~~ | ~~28~~ | **Fait** → `core/*` (6 modules) |
| P3 | ~~`settings/01c-role-models.js`~~ | ~~607~~ | ~~23~~ | **Fait** → `settings/role-models/*` (6 modules) |
| P4 | ~~`composer/03-composer.js`~~ | ~~577~~ | ~~18~~ | **Fait** → `composer/*` (6 modules, hors `03b`) |
| P5 | ~~`chrome/02-chrome.js`~~ | ~~487~~ | ~~16~~ | **Fait** → `chrome/*` (7 modules) |
| P6 | ~~`bridge/09-host.js`~~ | ~~451~~ | ~~14~~ | **Fait** → `bridge/*` (4 modules) |
| P7 | ~~`settings/01d-general-settings.js`~~ | ~~284~~ | ~~11~~ | **Fait** → `settings/general-settings/*` (6 modules) |
| — | Autres modules | &lt; 260 | &lt; 9 | OK pour l’instant |

---

## Phase 1 — `stream/07-log.js` (P0)

### Responsabilités cibles

| Dossier / fichier | Responsabilité |
|-------------------|----------------|
| `stream/log/00-constants.js` | Constantes partagées (`EXPLORE_PHASES`, marqueurs, seuils) → `D.streamLog` |
| `stream/discussion/state.js` | Verrous discussion/gate |
| `stream/display/simple.js` | Routage texte unique (`appendDelta`, `applyUserFacingReply`) |
| `stream/answer/helpers.js` | Sticky user |
| `stream/answer/presentation.js` | Fin de run, revert message |
| `stream/messages/viewer.js` | Viewer message utilisateur plein écran |
| `stream/messages/scroll.js` | Scroll log / thinking |
| `stream/messages/user.js` | Rendu message user (refs, images) |
| `stream/messages/orchestration.js` | Rôle orchestration léger, mount subagent |
| `stream/executor/capture.js` | Capture exécuteur par job, rails d’actions |
| `stream/executor/subagents.js` | Cartes subagent start/done |
| `stream/dev/gateTags.js` | Tags gate dev, gate path, notices |
| `stream/answer/stream.js` | `finalizeAssistant`, `appendMessage` |
| `stream/tools/logTools.js` | `createToolBlock`, `finishToolBlock` |
| `stream/timeline/phases.js` | `enterPhase`, `closePhaseMarker` (fil linéaire) |

**Fil linéaire (P1)** : `stream/timeline/*` — voir phase 2 ci-dessous.

### Taille des modules après découpe (lignes utiles)

| Fichier | Lignes |
|---------|--------|
| `timeline/overrides.js` | ~372 |
| `timeline/strip.js` | ~394 |
| `timeline/thinking.js` | ~202 |
| `timeline/architect-rail.js` | ~100 |
| `timeline/mount.js` | ~21 |
| `executor/capture.js` | ~445 |
| `display/simple.js` | ~370 |
| `answer/stream.js` | ~60 |
| `timeline/phases.js` | ~80 |
| `tools/logTools.js` | ~140 |
| `executor/subagents.js` | ~187 |
| `dev/gateTags.js` | ~167 |
| *autres* | &lt; 130 chacun |

### Critères de done phase 1

- [x] `07-log.js` supprimé — découpé via `scripts/split-07-log.mjs`
- [x] `DROX_CHAT_SCRIPT_FILES` mis à jour (19 scripts `stream/*` hors timeline)
- [x] `droxChat/README.md` + ce fichier à jour
- [ ] Smoke test chat : greeting « Salut », run avec outil, onglet session

---

## Phase 2 — `stream/07b-runTimeline.js` (P1)

| Fichier | Responsabilité |
|---------|----------------|
| `stream/timeline/strip.js` | Strip DOM, sections, seal/park, sticky layout, `isArchitectVerifyTool` |
| `stream/timeline/thinking.js` | Panneau thinking linéaire, déduplication, `appendLinearThinkingDelta` |
| `stream/timeline/architect-rail.js` | Rails d’actions architecte dans le shell thinking |
| `stream/timeline/mount.js` | `ensureAssistantInRunAnswer`, tag strip |
| `stream/timeline/overrides.js` | Wrappers `setBusy`, `appendDelta`, `enterPhase`, activity sticky, etc. |

**Ordre de chargement** : après tous les modules `stream/*`, `timeline/*` en dernier (surcharges).

### Critères de done phase 2

- [x] `07b-runTimeline.js` supprimé — `scripts/split-07b-runTimeline.mjs`
- [x] `DROX_CHAT_SCRIPT_FILES` mis à jour
- [ ] Smoke test fil linéaire (Salut, tool architect, busy off)

---

## Phase 3 — `core/00-context.js` (P2)

| Fichier | Responsabilité |
|---------|----------------|
| `core/00-bootstrap.js` | `DroxChat` namespace, `acquireVsCodeApi()` |
| `core/dom.js` | Références `D.dom.*` |
| `core/constants-modes.js` | Modes permission, clés storage |
| `core/state.js` | État initial `D.state.*` (hors warmup) |
| `core/warmup-phrases.js` | `D.const.WARMUP_PHRASES` |
| `core/constants-meta.js` | Cap exécuteurs, `PHASE_META`, todos, onglets session |

**Ordre** : bootstrap → dom → constants-modes → state → warmup-phrases → constants-meta.

### Critères de done phase 3

- [x] `00-context.js` supprimé — `scripts/split-00-context.mjs`
- [x] `DROX_CHAT_SCRIPT_FILES` mis à jour
- [ ] Smoke test : DOM présent, busy/warmup, onglets session

---

## Phases suivantes (backlog)

| Phase | Cible | Notes |
|-------|--------|-------|
| — | Inventaire P0–P7 | **Terminé** — smoke test chat recommandé |

---

## Journal des changements

| Date | Action |
|------|--------|
| 2026-06-04 | Création du suivi ; inventaire volumétrique ; démarrage découpe `07-log.js` |
| 2026-06-04 | Phase 1 : `07-log.js` → 19 fichiers (`stream/log`, `discussion`, `answer`, `explore`, `executor`, …) ; constantes `D.streamLog` |
| 2026-06-04 | Suppression heuristiques prose (`isModelThinkingMonologue`, `isDiscussionNonAnswerProse`, `promoteDiscussionThinkingToAnswer`) — UI pilotée par phases moteur + `userFacingReply` + JSON gate structuré uniquement |
| 2026-06-04 | Phase 2 (P1) : `07b-runTimeline.js` → `stream/timeline/` (strip, thinking, architect-rail, mount, overrides) |
| 2026-06-04 | Phase 3 (P2) : `00-context.js` → `core/` (bootstrap, dom, constants-modes, state, warmup-phrases, constants-meta) |
| 2026-06-04 | Phase 4 (P3) : `01c-role-models.js` → `settings/role-models/` (state, helpers, panel, persist, host-sync, init) |
| 2026-06-04 | Phases 5–7 (P4–P6) : `03-composer.js`, `02-chrome.js`, `09-host.js` découpés ; P7 `01d-general-settings` → `general-settings/` |
