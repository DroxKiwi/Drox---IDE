# Smoke backlog — bugs hors refonte 1.4.0

**Parent** : [README](README.md) · **Statut** : à traiter **post-1.4.0** (polish 1.4.0.x — ne pas bloquer la clôture rail).

Source : dogfood juin 2026 — transcript [`docs/1.3/chat.txt`](../../1.3/chat.txt) (site-kdds / `globals.css`), smoke Phase 4 avec `runRailEnabled` preset `normal`.

---

## Règle

| Champ | Valeur |
|-------|--------|
| Priorité traitement | Post-1.4.0 Phase 4 (polish) ou 1.4.0.x |
| Lien refonte | Ces bugs existent **hors** `run_rail` ; le rail peut **atténuer** certains symptômes moteur plus tard |
| Commit backlog | Documenter ici d’abord ; fix = issue / PR dédiée |

---

## B-UI-01 — Fichiers édités repliés par défaut

**Symptôme** : les cartes `file_edit` / `file_write` apparaissent **repliées** alors que l’attendu produit est **ouvert** (diff visible).

**Repro** : run architecte solo sur charte CSS (`globals.css`) — voir capture smoke test juin 2026.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `src/vs/workbench/contrib/drox/browser/media/droxChat/tools/12-fileChange.js` | Carte créée **sans** `is-collapsed` ; `aria-expanded="true"` — comportement nominal = ouvert |
| `src/vs/workbench/contrib/drox/browser/media/droxChat/tools/13-collapsibleTray.js` | `tray.open = false` — si le diff est monté dans un **tray**, il peut paraître replié |
| `src/vs/workbench/contrib/drox/browser/media/droxChat/stream/tools/logTools.js` | `shouldUseCollapsibleToolTray` → `mountToolBlockInTray` — vérifier si `fileChange` passe par le tray |
| `drox.openModifiedFiles` | Réglage général (défaut `true`) — distinct du repli diff, mais à croiser |

**Pistes debug**

1. Tracer le chemin `host.post({ kind: 'fileChange' })` vs `kind: 'tool'` pour une mutation.
2. Vérifier si le CSS `.msg-file-change.is-collapsed` est appliqué à la création (régression tray ?).
3. Tester avec fil linéaire architecte ON/OFF (`linearRunUi`).

**Critère fix** : après `file_write` / `file_edit` réussi, carte diff **ouverte** sans clic utilisateur.

---

## B-UI-02 — Lignes « Ran » consécutives écrasent le layout

**Symptôme** : plus il y a de lignes **Ran** (bash) à la suite, plus le bloc suivant (thinking / texte / file change) est **verticalement compressé** / illisible (voir capture).

**Repro** : phase VERIFY du transcript — steps 20–23 (`npx next lint`, `npm run lint`, `node -e`, `type … find`) en rafale.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `stream/tools/logTools.js` | `details.open = false` à la création ; `finishToolBlock` garde `open = false` |
| `tools/13-collapsibleTray.js` | Accumulation d’outils dans un même tray — suspect **#1** pour l’écrasement |
| `stream/timeline/architect-rail.js` | Rails `executor-action-rail` / `architect-action-rail` — `open = false`, compteur de lignes |
| `browser/media/droxChatMvp.css` | Règles `.msg-tool`, `.drox-log-indent`, `.msg-file-change` — chercher `max-height`, `flex`, `overflow` sur parents communs |

**Pistes debug**

1. Inspecter le DOM après 4+ `Ran` : hauteur calculée du parent `#log` / tray.
2. Repro minimal : 5× `bash` echo en série sans mutation.
3. Désactiver collapsible tray (feature flag ou patch local) et comparer.

**Critère fix** : N lignes Ran consécutives n’affectent pas la hauteur des blocs voisins.

---

## B-UI-03 — Plan du run précédent rattaché au nouveau message

**Symptôme** : un plan **terminé** (ex. 3/3 barré) du run d’avant réapparaît **sous le nouveau message** utilisateur et dans le **sticky header** (« Architect — planning and delegation »). Il disparaît seulement quand le modèle émet un **nouveau** `todo_write`.

**Repro** (smoke juin 2026, charte CSS) :

1. Terminer un run avec plan complet (fix `globals.css` + charte).
2. Envoyer un nouveau message (« charte graphique », etc.).
3. Le plan 3/3 du run précédent se déplace après le nouveau message user.
4. Même plan visible en sticky jusqu’au prochain plan.

**Cause probable** : le bloc plan (`currentTodoBlockEl`) et le `drox-run-strip` ne sont **pas scellés par run** — `reparentTodoBlockToPlan` / `ensureRunStrip` réutilisent l’état global au lieu de créer un strip neuf par message user.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `stream/timeline/strip.js` | `onUserMessageForRunStrip` repositionne le strip après chaque user ; `adopted` strip non scellé réutilisé ; `reparentTodoBlockToPlan` déplace le **même** bloc plan |
| `stream/timeline/strip.js` | `sealRunStrip` / `data-sealed="1"` — vérifier si le plan est clôturé **avant** le message user suivant |
| `core/state.js` | `currentTodoBlockEl`, `runStripEl` — reset incomplet entre runs dans la même session |
| `bridge/host-message.js` | `todoUpdate` — pas d’ID run / stripId sur le bloc plan |

**Critère fix** : à l’envoi d’un nouveau message user, le plan du run **précédent** reste ancré dans le strip scellé de ce run ; le nouveau run démarre sans plan (ou avec un plan vide) jusqu’au prochain `todo_write`.

---

## B-UI-04 — Questionnaire `ask_user` : markdown brut + trop haut

**Symptôme** : dans la carte **Questions**, le prompt affiche le markdown **brut** (`**gras**`, listes, tableaux) via `textContent`. Le bloc question occupe toute la hauteur disponible.

**Repro** : run charte CSS — `ask_user` avec 3 directions visuelles + tableau (capture smoke juin 2026).

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `user-ask/06-userAsk.js` | L.126–128 : `promptLine.textContent = …` — pas de rendu markdown |
| `droxChatMvp.css` | `.user-ask-prompt` — ajouter `max-height` (~8 lignes) + `overflow-y: auto` |
| Réutiliser | `fn.renderMarkdown` / classe `markdown` comme les messages assistant |

**Critère fix** : prompt rendu en markdown ; zone question **≤ 8 lignes** visibles puis scroll interne.

---

## B-UI-05 — Phase thinking active toujours en tête du fil

**Symptôme** : pendant tout le run, la section **thinking** reste **en haut** du strip linéaire (`work` → `thinking` → `verify` → `answer` ordre fixe). Seul le contenu thinking est mis à jour ; les phases ultérieures (lecture, plan, réponse) s’affichent **en dessous**, alors que l’utilisateur attend que **la phase en cours** soit la **dernière** visible (ordre chronologique).

**Attendu produit** : séquence visuelle append-only par **événement** — ex. thinking → lecture fichier → plan → réponse → nouveau thinking — la partie animée / active toujours **en bas**.

**Repro** : run charte CSS multi-phases ; bandeau « …negotiation with the linter… » reste en haut pendant que plan et réponse s’accumulent dessous.

**Pistes code (IDE)**

| Fichier | Observation |
|---------|-------------|
| `stream/timeline/strip.js` | Ordre DOM fixe : sticky `plan` puis sections `work`, `thinking`, `verify`, `answer` |
| `stream/timeline/thinking.js` | Un seul panneau thinking canonique dans `[data-section="thinking"]` |
| `stream/timeline/phases.js` | Routage `internal_reasoning` → section thinking |
| `stream/timeline/overrides.js` | `agent-activity-sticky` / inline activity en tête sticky |

**Pistes design**

1. **Timeline append-only** : chaque phase = bloc chronologique dans `#log` ou strip, pas sections fixes.
2. **Promotion** : à la fermeture d’une phase, la replier et append la suivante en bas.
3. **Run Rail U2/U3** : blocs station pourraient remplacer partiellement ce modèle — à croiser avec `run-rail-stations.js`.

**Critère fix** : à tout instant, le bloc « en cours » (thinking animé, outil, plan actif) est le **dernier** élément du fil du run courant.

---

## B-MOTOR-01 — Réflexion qui « recommence » à chaque micro-avancée

**Symptôme** : à chaque tour (lecture fichier, petit fix), le modèle **reformule tout le plan** depuis le début (« Let me first fix… », « I already have a good picture… », « Le problème est clair… ») au lieu d’incrémenter.

**Repro** : [`chat.txt`](../../1.3/chat.txt) steps ~11–26 — phase réglage `globals.css`.

**Ce n’est probablement pas qu’un bug UI** : le texte de réflexion est souvent le **nouveau tour** `thinking` / préambule du modèle, pas une réinjection verbatim de l’historique.

**Hypothèses (à valider)**

| # | Hypothèse | Piste |
|---|-----------|-------|
| H1 | **Pas de rail** (run solo pré-1.4.0) — pas de segment / pas de station VERIFY isolée | Activer `runRailEnabled` + dogfood même scénario |
| H2 | **Snapshot architecte réinjecté chaque tour** (`architect_run_context_block_per_turn`) — le modèle « relit » le plan et resynthétise | Logger taille snapshot ; A/B sans refresh mid-run |
| H3 | **Échecs outil → nouveau tour complet** (bash Windows steps 20–23) — chaque erreur relance une boucle LLM avec re-planification | Corréler steps avec `ToolFinish is_error` |
| H4 | **Pas de marqueur `[phase: done]`** — le moteur relance via nudge « continue » | Compter iterations avant clôture |
| H5 | **Thinking natif** affiché intégralement à chaque tour — donne l’impression de boucle sémantique même si le travail avance | UI : replier thinking passé ? |
| H6 | **Loop detector** ne fingerprint pas les préambules de plan (texte différent à chaque fois) | `normalize_for_loop_fingerprint` — étendre ? |

**Données transcript**

- Steps 24–25 : **double** `file_read` du même `globals.css` déjà corrigé.
- Steps 27 vs 29 : **double** bloc `[phase: answering]` quasi identique.
- Steps 20–23 : spirale bash (lint timeout, `head` absent sur Windows, `node -e` quoting cassé).

**Critère fix (moteur)** : après mutation réussie sur un path, pas de re-lecture complète + re-plan identique sans nouveau signal user (heuristique ou rail ACT/VERIFY).

---

## B-MOTOR-02 — Spirale bash VERIFY sur Windows

**Symptôme** : tentatives `head`, `npm run lint` (timeout 30s), `node -e` avec guillemets cassés — 4+ tours perdus.

**Repro** : chat.txt steps 20–23.

**Pistes**

| Piste | Détail |
|-------|--------|
| Prompt VERIFY / sanity | Rappeler environnement **Windows** + commandes PowerShell-compatibles |
| `cycle_sanity` | Ne déclencher qu’en station VERIFY (1.4.0) — évite sanity prématurée en READ |
| Pre-check bash | Détecter `head`/`tail` et suggérer alternative avant exécution (hors scope 1.4.0 ?) |

**Critère fix** : smoke VERIFY sur repo Next.js Windows — au plus 1–2 bash, pas 4+.

---

## B-MOTOR-03 — Double livrable answering

**Symptôme** : réponse utilisateur finale envoyée **deux fois** (steps 27 et 29) + LSP diagnostics redondant.

**Pistes** : `done_without_answering` promotion, `FinalAnswerGuard`, ou modèle qui émet `[phase: done]` puis continue.

---

## Lien avec Run Rail 1.4.0

| Backlog | Atténuation attendue du rail (pas encore prouvée en dogfood) |
|---------|---------------------------------------------------------------|
| B-MOTOR-01 | Segments ACT + stations — moins de contexte parent en boucle mutation |
| B-MOTOR-02 | `cycle_sanity` gated VERIFY |
| B-UI-03 | Sceller plan + strip par run (session multi-tours) |
| B-UI-04 | Polish questionnaire — indépendant du rail |
| B-UI-05 | Ordre chronologique phases — complémentaire aux blocs station rail |
| B-UI-01/02 | Collapsible tray / Ran layout — hors scope moteur |

**Action post-Phase 4** : rejouer **même prompt** charte CSS avec `runRailEnabled: true` et cocher quels IDs persistent.

---

## Journal

| Date | Note |
|------|------|
| 2026-06-08 | Création backlog depuis smoke test utilisateur (pre-commit Phase 3 local) |
| 2026-06-05 | Smoke Phase 4 : B-UI-03 plan orphelin, B-UI-04 ask_user markdown, B-UI-05 ordre thinking |
