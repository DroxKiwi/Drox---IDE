# UI chat — conducteur d’affichage & alignement moteur 1.4.0

**Référence moteur** : [FOI-REFONTE.md](FOI-REFONTE.md) · **Code** : `src/vs/workbench/contrib/drox/`  
**Polish détaillé** : [1.4.2](../1.4.2/README.md) (B-UI-*) · **Journal** : [SMOKE-BACKLOG.md](SMOKE-BACKLOG.md)

Document de **review** : impact fork VS Code, liste obsolète / à garder, conducteur d’affichage cible.

---

## I — Est-ce que la refonte moteur casse l’UI ?

### Court terme : pas de crash massif

L’UI consomme des **événements** (`droxChatAgentEvents.ts` → webview). Si le moteur **n’émet plus** segment / subagent / delegate :

- les handlers restent mais ne s’exécutent plus → **code mort**, pas erreur JS ;
- le fil linéaire (`strip.js`) et les cartes rail (`run-rail-stations.js`) **continuent** à tourner.

### Incohérence produit (le vrai risque)

| Symptôme | Cause |
|----------|--------|
| Deux conducteurs en parallèle | Strip fixe (plan/work/thinking/verify/answer) **+** cartes `#log` rail |
| Bannière « planning and delegation » | Texte multi-modèle alors que moteur solo |
| Réglages executor / subagents / professor | Tuning sans effet côté moteur |
| Segments vides / jamais créés | UI U3 prête, moteur option A supprimée |
| Thinking toujours en tête | Ordre DOM strip, pas chronologique (B-UI-05) |

**Conclusion** : la refonte moteur **ne casse pas** l’affichage comme un build rouge ; elle rend l’UI **menteuse ou bruyante** si on ne nettoie pas le fork en parallèle.

---

## II — Principe : même vérité que le moteur (D7 UI)

| Moteur (FOI) | UI |
|--------------|-----|
| Edit + rail seul | **Une** timeline par run, guidée par **stations** |
| Discuss court | Pas de strip rail complet |
| Pas delegate / segment / explore / professor | Pas de cartes / réglages / rails associés |
| Outils filtrés par station | Outils montés **dans la station active** |

---

## III — À SUPPRIMER (UI obsolète)

### Priorité P0 — avec Phase moteur 2a–2c (dette visible)

| Module / fichier | Raison |
|------------------|--------|
| `stream/executor/capture.js` | Capture runs Executor — hors contrat |
| `stream/executor/subagents.js` | Cartes explore/subagent |
| `run-rail-stations.js` — `renderRailSegment*`, `runRailSegmentCards` | Segments ACT supprimés moteur |
| `common/railSegmentTypes.ts` — segment wire | Idem |
| `droxChatAgentEvents.ts` — handlers `railSegment*`, `subagent*` | Events plus émis |
| `droxOrchestrationUi.ts` + masquage delegate | Déjà off — **DEL** le code |
| `settings/role-models/*` — onglet / champs **Executor** | Hors contrat |
| `droxEngineTuningConfiguration.ts` — `delegate_*`, `executor_*`, parallel | Settings fantômes |
| `droxRunSettings.ts` — `orchestrationMaxParallelExecutors`, subagents | Idem |
| `droxToolGroups.ts` — groupe professor / `course_plan_write` | Professor DEL |
| `droxConfiguration.ts` — `permissionMode: professor` (ou erreur explicite) | Aligné Phase 2c |
| `stream/messages/orchestration.js` — bannière « delegation » | Texte obsolète |
| `stream/timeline/architect-rail.js` | Rails repliés type executor — remplacé par conducteur station |
| `droxExploreTools.ts` — routage `task` | Explore DEL |
| `logTools.js` — badges Sync/Async `task` | Idem |
| Replay / export segment-subagent (`droxUiReplayExport.ts`, tests) | ADAPT |

### Priorité P1 — Phase UI 1.4.2 (conducteur)

| Module | Raison |
|--------|--------|
| `stream/timeline/strip.js` — sections fixes work/thinking/verify | Remplacé par timeline station |
| `stream/timeline/overrides.js` — routage executor / linear architect rail | Simplifier vers station active |
| `display/simple.js` — branches `isExecutorUiContext` | Code mort post-2b |

### Priorité P2 — CSS / classes mortes

| Cible | Raison |
|-------|--------|
| `.drox-executor-grid`, `.executor-action-rail`, segment CSS | Après DEL modules |
| `droxChatMvp.css` règles segment / subagent | Nettoyage |

---

## IV — À GARDER (UI minimale cohérente)

| Feature | Fichiers | Rôle |
|---------|----------|------|
| **Stations rail** enter/hold/done | `run-rail-stations.js`, `droxChatAgentEvents.ts` | Conducteur principal edit |
| **Outils** Ran / Read | `stream/tools/logTools.js`, `bridge/tool-events.js` | READ / VERIFY / PLAN |
| **Mutations** | `tools/12-fileChange.js` | ACT |
| **Tray** (si gardé) | `tools/13-collapsibleTray.js` | Densité outils — fix B-UI-01/02 en 1.4.2 |
| **Todos** | `chrome/todos.js` | PLAN |
| **Thinking + réponse** | `thinking.js`, `display/simple.js`, `stream/answer/*` | ANSWER / stream |
| **Phases stream** (badges) | `phases.js` | Legacy stream — optionnel, pas conducteur |
| **Discuss** | `discussion/*`, rôle `architect_discussion` | Chemin court |
| **User ask** | `user-ask/06-userAsk.js` | PROPOSE / hold |
| **Composer, tabs, session** | `composer/*`, `session/*` | Socle |
| **Busy, abort, revert** | `chrome/busy.js`, `bridge/abort.js` | Cycle run |
| **Context / usage** | handlers existants | Observabilité |

---

## V — Conducteur d’affichage **actuel** (état fork)

```text
[Message utilisateur]
  ├─ .drox-run-strip (linearRunUi)     ← ordre DOM FIXE
  │    sticky: banner → plan (todos)
  │    work → thinking → verify → answer
  │    (+ architect-rail replié dans work)
  │
  └─ #log (en parallèle)
       msg-rail-station × N              ← append chronologique
         └─ msg-rail-segment (sous act) ← multi-modèle

Hors strip: fileChange, userAsk, loopIntervention, memory
```

**Problème** : deux vérités d’ordre — strip impose thinking au-dessus du travail ; rail impose chronologie par station.

---

## VI — Conducteur d’affichage **cible** (aligné FOI)

### Règle

**Une carte station = un bloc `<details>` append-only dans `#log`.**  
Le contenu du tour (texte, outils, diffs) se monte **dans le corps de la station active** — pas dans un strip parallèle à sections fixes.

### Séquence (edit)

```text
INTENT → READ → [PROPOSE] → PLAN → ACT → VERIFY → ANSWER
```

| Station | Contenu affiché | Source événements |
|---------|-----------------|-------------------|
| **INTENT** | Texte assistant (pas d’outils) | `delta` / texte |
| **READ** | Lignes Ran Read (file_read, grep, glob, lsp, map…) | `tool` |
| **PROPOSE** | Texte + `ask_user` ; badge **Hold** sur `railStationHold` | `userAsk`, `railStationHold` |
| **PLAN** | Bloc todos + reads optionnels | `todoUpdate`, `tool` read |
| **ACT** | **fileChange** + Ran mutation (bash, file_write…) | `fileChange`, `tool` |
| **VERIFY** | Ran bash/lsp/read | `tool` |
| **ANSWER** | Thinking (optionnel replié) + `userFacingReply` / stream answer | `delta`, `userFacingReply`, `phase` |

Station terminée → `railStationDone` → carte repliée (`open = false`), suivante ouverte.

### Chemin court (sans PLAN)

READ minimal → ACT → VERIFY → ANSWER (mêmes règles de montage).

### Discuss

- **Pas** de bande stations complète.
- Texte + reads optionnels + réponse — pas de strip « work/delegation ».

### Ce qu’on n’affiche plus

- Segments nested sous ACT.
- Cartes subagent / grille executor.
- Bannière delegation.
- Rails `architect-action-rail` / `executor-action-rail` repliés.

---

## VII — Phasage (aligné FOI § XIV)

| Phase FOI | Quoi | Quand |
|-----------|------|-------|
| **UI-0** | Ce document + lien FOI | Fait |
| **2d** | **UI P0** — DEL § III (executor/, segment UI, settings, architect-rail…) | Après moteur **2b** ; avant smoke **5** |
| **1–5** | Squelette moteur | [FOI-REFONTE](FOI-REFONTE.md) § XIV |
| **UI-2** (1.4.2) | Conducteur cible § VI — fusion strip → timeline stations | B-UI-01…07 |
| **UI-3** (1.4.1/2) | Polish CSS, replay allégé | Backlog |

**Étapes détaillées Phase 2d** : [FOI-REFONTE § Phase 2d](FOI-REFONTE.md#phase-2d--alignement-ui-fork-vs-code-p0).

**Ne pas bloquer** le moteur sur UI-2 — mais **2d est obligatoire** avant validation Phase 5 (G-ui).

---

## VIII — Checklist cohérence post-chantier

- [ ] Aucun script chargé dans `droxChatWebview.ts` pour executor/subagent/segment
- [ ] `grep -r "executor-action-rail\|runRailSegment\|subagent" contrib/drox/browser/media/droxChat` → 0 hors archive/tests
- [ ] Settings : un seul modèle architecte visible (discuss peut partager)
- [ ] Smoke : une feature edit affiche **stations** avec outils **dans** la bonne carte
- [ ] Discuss : pas de bande rail complète
- [ ] B-UI-05 résolu (ordre chronologique = ordre stations)

---

## IX — Liens code

| Rôle | Chemin |
|------|--------|
| Dispatch AgentEvent | `browser/droxChatAgentEvents.ts` |
| Kinds hôte → webview | `common/droxChatHostMessageKinds.ts` |
| Stations rail UI | `media/droxChat/stream/timeline/run-rail-stations.js` |
| Strip linéaire (legacy) | `media/droxChat/stream/timeline/strip.js` |
| Outils | `media/droxChat/stream/tools/logTools.js` |
| File diff | `media/droxChat/tools/12-fileChange.js` |
| Chargement scripts | `browser/droxChatWebview.ts` |

---

*Aligné FOI D7 — juin 2026*
