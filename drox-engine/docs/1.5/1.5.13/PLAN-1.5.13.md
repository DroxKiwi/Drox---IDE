# Plan 1.5.13 — Stabilisation fenêtre Agents

**Version** : juillet 2026 · **Base** : [1.5.12](../1.5.12/PLAN-1.5.12.md) livrée  
**Branche** : `1.5.13` · tag cible **`v1.5.13`**

**Doc unique** : toutes les étapes sont ici. Détail technique long → [NOTES-CHARGEMENT-FIL.md](NOTES-CHARGEMENT-FIL.md) (optionnel).

---

## En une phrase

Corriger d’abord le **fil vide** et la **lenteur/crash** en prod ; le reste (reports 1.5.12, nettoyage) **après** ou en parallèle si marge.

---

## Stratégie — aller vite

```text
S1 → S4   correctifs fil + replay tail     (~1–2 j)   SHIP si smoke OK
S5 → S7   perf caches (si encore lent)      (~1–2 j)
S8        smoke install + logs              (~0.5 j)
S9 → S11  reports 1.5.12                    reporté si pressé
S12 → S18 nettoyage Tier A                  quand CI verte, pas bloquant release
```

**Ne pas faire maintenant** : supprimer webview legacy, fusionner parseurs replay, retirer shims migration, build conditionnel JS — voir [§ Risques](#grille-des-risques-par-étape).

---

## Vue d’ensemble des étapes

| Étape | Intitulé | Priorité | Effort | Risque | Statut |
|-------|----------|----------|--------|--------|--------|
| **S1** | Workspace path session (plus de `folders[0]`) | **P0** | faible | faible | ✅ |
| **S2** | Retry `ChatView.setChat` si modèle absent | **P0** | faible | faible | ✅ |
| **S3** | Invalider cache chat Drox au switch | **P0** | moyen | moyen | ✅ |
| **S4** | `readUiReplayTail` dans handler Agents | **P0** | faible | faible–moyen | ✅ |
| **S5** | Lazy `_hydrateSessionChanges` | P1 | moyen | moyen | ⏳ |
| **S6** | Éviction modèles chat / caches provider | P1 | moyen | moyen | ⏳ |
| **S7** | Seek fin fichier replay (gros jsonl) | P2 | moyen | moyen | ⏳ |
| **S8** | Logs + smoke repro + install | P1 | faible | aucun | ⏳ |
| **S9** | MCP `mcp__*` au run | P2 | moyen | moyen | ⏳ |
| **S10** | Purge strings Copilot (P8) | P2 | large | moyen | ⏳ |
| **S11** | Smokes 1.5.12 restants (commit, onglets) | P2 | faible | faible | ⏳ |
| **S12** | Supprimer stub `droxChatMvp.js` + script mvp | P3 | faible | **très faible** | ⏳ |
| **S13** | Supprimer exports TS sans appelant | P3 | faible | **très faible** | ⏳ |
| **S14** | Renommer alias recovery / migrer `droxTodoExtract` | P3 | faible | **très faible** | ⏳ |
| **S15** | Alias Ollama / numCtx — ajuster tests | P3 | faible | **très faible** | ⏳ |
| **S16** | Retirer `attachVignettesRoot` | P3 | faible | **très faible** | ⏳ |
| **S17** | Mesure taille bundle `media/droxChat` | P3 | faible | aucun | ⏳ |
| **S18** | Build conditionnel JS legacy (optionnel) | P4 | large | **élevé** | 📅 |

---

## S1 — Workspace path session (P0)

**Symptôme** : fil vide après changement de dossier (ProjectBar) alors que `.ui-replay.jsonl` existe.

**Cause** : `droxAgentsSessionHandler._resolveWorkspacePath` retombe sur `folders[0]` au lieu du workspace de la session.

| # | Tâche | Fichier | Statut |
|---|--------|---------|--------|
| S1-1 | Résoudre `workspacePath` via `ensureSessionWorkspacePath` / `workingDirectory` uniquement | `droxAgentsSessionHandler.ts` | ✅ |
| S1-2 | Supprimer fallback `folders[0]` | idem + `droxSessionsProvider.ts` | ✅ |
| S1-3 | Log warn si `history.length === 0` avec `sessionId` + `workspacePath` | idem | ✅ |

**Done** : switch dossier puis réouverture session → fil peuplé (smoke `rtr-trastemp-v2`).

---

## S2 — Retry `setChat` (P0)

**Symptôme** : fil vide intermittent ; recliquer la même discussion ne recharge rien.

**Cause** : garde `isEqual(_currentChatResource)` alors que `_modelRef` / `viewModel` est vide après annulation ou `setModel` no-op.

| # | Tâche | Fichier | Statut |
|---|--------|---------|--------|
| S2-1 | Recharger si même ressource mais pas de modèle attaché | `chatView.ts` | ✅ |
| S2-2 | Vérifier garde équivalente dans `ChatWidget.setModel` | `chatWidget.ts` | ⏳ |
| S2-3 | Garde load in-flight + pas de clear sur même ressource (autorun) | `chatView.ts` | ✅ |
| S3-bis | Evict skip si `requestInProgress` | `droxAgentsChatSessionCache.ts` | ✅ |
| S2-3 | Test switch rapide A→B→A < 500 ms | tests | ⏳ |

---

## S3 — Cache chat Drox (P0)

**Symptôme** : fil vide **persistant** après une première ouverture ratée.

**Cause** : `ChatSessionsService._sessions` et `acquireExistingSession` renvoient un historique `[]` figé.

| # | Tâche | Fichier | Statut |
|---|--------|---------|--------|
| S3-1 | Invalider entrée cache type `drox` au switch session / workspace | `chatSessions.contribution.ts`, `droxAgentsChatSessionCache.ts`, `chatView.ts` | ✅ |
| S3-2 | Ou clé cache `(sessionResource, workspacePath)` | idem | ⏳ |
| S3-3 | Vérifier `loadRemoteSession` ne réutilise pas modèle vide | `chatServiceImpl.ts` | ⏳ |

---

## S4 — Replay tail Agents (P0)

**Symptôme** : lenteur extrême / freeze / crash au switch (sessions longues).

**Cause** : `readUiReplay` lit tout le `.ui-replay.jsonl` ; la webview utilise déjà `readUiReplayTail`.

| # | Tâche | Fichier | Statut |
|---|--------|---------|--------|
| S4-1 | Remplacer `readUiReplay` par `readUiReplayTail(maxTurns: N)` | `droxAgentsSessionHandler.ts` | ✅ |
| S4-2 | Réutiliser constante / défaut aligné webview (`droxChatTabsManager`) | idem | ⏳ |
| S4-3 | « Charger plus » historique (scroll / bouton) | handler + UI | ⏳ — `hasOlder` déjà exposé par `readUiReplayTail` |

**Note** : S4 change ce qui s’affiche **à l’ouverture** (derniers N tours d’abord) — comportement voulu, pas un bugfix transparent. Risque : utilisateur ne voit pas tout l’historique immédiatement.

---

## S5 — Lazy hydratation Changes (P1)

| # | Tâche | Fichier | Statut |
|---|--------|---------|--------|
| S5-1 | `_hydrateSessionChanges` + git watch au **premier open** session, pas au scan boot | `droxSessionsProvider.ts` | ✅ |
| S5-2 | Même pattern pour `readUiReplay` dans hydratation changes | idem | ⏳ |

---

## S6 — Éviction mémoire (P1)

| # | Tâche | Fichier | Statut |
|---|--------|---------|--------|
| S6-1 | LRU ou limite modèles chat Drox simultanés | `chatModelStore.ts` / couche Drox | ⏳ |
| S6-2 | Évincer `_gitWatchStores` sessions non visibles | `droxSessionsProvider.ts` | ⏳ |
| S6-3 | Purger `sessionChangesDetailService` au switch workspace | services changes | ⏳ |

---

## S7 — Seek replay disque (P2)

| # | Tâche | Fichier | Statut |
|---|--------|---------|--------|
| S7-1 | Ne pas `readFile` entier dans `readUiReplayParsed` | `droxSessionService.ts` | ⏳ |

Réf. : [idée 06](../../feature-brainstorm/06-chargement-sessions-segmente.md) · [NOTES-CHARGEMENT-FIL.md](NOTES-CHARGEMENT-FIL.md)

---

## S8 — Validation prod (P1)

| # | Tâche | Statut |
|---|--------|--------|
| S8-1 | Logs `[Drox Agents]` : `sessionId`, `workspacePath`, `historyItems`, `loadMs` | ⏳ |
| S8-2 | Smoke : switch discussion + dossier (capture juillet 2026) | ⏳ |
| S8-3 | Smoke install Windows neuve + upgrade 1.5.12 | ⏳ |
| S8-4 | Test auto `dataset.boundChatResource` après `setChat` | ⏳ |

---

## S9 — MCP au run (P2, report 1.5.12)

| # | Tâche | Statut |
|---|--------|--------|
| S9-1 | Outils `mcp__*` visibles si `drox.tools.mcp.enabled` | ⏳ |

---

## S10 — Purge Copilot (P2, report 1.5.12)

| # | Tâche | Statut |
|---|--------|--------|
| S10-1 | Grep + remplace strings MS visibles en session Drox | ⏳ |

---

## S11 — Smokes 1.5.12 restants (P2)

| # | Tâche | Statut |
|---|--------|--------|
| S11-1 | Composer Commit & Push (P6-D) | ⏳ |
| S11-2 | Working set onglets terminal (P6-E6) | ⏳ |

---

## S12–S16 — Nettoyage Tier A (P3, non bloquant)

Suppression de symboles **sans appelant** ou stubs — ne touche aucun chemin d’exécution prod.

| Étape | Tâche | Fichiers | Statut |
|-------|--------|----------|--------|
| **S12** | Supprimer `droxChatMvp.js`, `split-drox-chat-mvp.mjs`, allowlist eslint | `media/`, `scripts/`, `.eslint-allowed-javascript-files` | ⏳ |
| **S13** | Supprimer `getDroxReleaseNotesDetail`, `readDroxAgentsConfigurationValue/String` | `droxReleaseNotes.ts`, `droxAgentsConfiguration.ts` | ⏳ |
| **S14** | `offerRunRecoveryAfterError` → `offerRunRecovery` ; imports → `chat/droxTodoExtract` ; delete shim | 7 fichiers | ⏳ |
| **S15** | Tests : `resolveLlmServerUrl` / `clampDroxNumCtx` ; supprimer alias Ollama/numCtx | tests, `droxLlmCatalog.ts` | ⏳ |
| **S16** | Retirer `attachVignettesRoot` | `droxAgentsComposerDroxChatHost.ts` | ⏳ |

**Garder** : `droxChatMvp.css` (legacy + activity grid), shims `nexus.drox` / `professor`, flags escape hatch, 24 JS composer Agents, stack webview legacy (flag).

---

## S17–S18 — Bundle (P3–P4, optionnel)

| Étape | Tâche | Statut |
|-------|--------|--------|
| **S17** | Mesurer octets `media/droxChat/**` dans release | ⏳ |
| **S18** | Exclure ~51 modules JS legacy-only du package si flag off au build | 📅 |

---

## Grille des risques par étape

| Niveau | Signification | Étapes |
|--------|---------------|--------|
| **Aucun / très faible** | Aucun chemin runtime prod modifié ; delete sans appelant | S8 (logs), S12–S16, S17 |
| **Faible** | Correction ciblée ; régression limitée si tests smoke OK | S1, S2 |
| **Faible–moyen** | Améliore perf mais change l’UX d’ouverture (tail vs full) | S4 |
| **Moyen** | Touche caches upstream / lifecycle ; effets de bord possibles | S3, S5, S6, S9, S10, S11 |
| **Moyen–élevé** | Refonte I/O ou build | S7, S18 |
| **Élevé** | Casse escape hatch, migrations ou référence dev | Supprimer webview legacy, `extension-vscode/`, shims `nexus.drox` — **hors plan** |

### Pourquoi S12–S16 sont les seules « sans risque fonctionnel » ?

Ce ne sont **pas** les seules étapes utiles — ce sont les seules où **aucune ligne exécutée en prod default ne change** :

- On enlève du code **jamais appelé** (0 import, stub vide).
- Aucun flag, cache, replay ou widget n’est modifié.

**S1–S4** sont **plus importantes** mais **changent le comportement** (volontairement) : corriger un bug ou afficher l’historique autrement. Risque = régression sur un edge case (session sans `workingDirectory`, switch ultra-rapide, etc.) — d’où smoke obligatoire, pas « zéro risque ».

**S3, S6** : invalider un cache peut **augmenter** les lectures disque ou **détruire** un modèle qu’on voulait retrouver instantanément — trade-off mémoire vs UX.

**S18 / suppression legacy** : si un utilisateur ou un test active `drox.ideLegacyWebviewChat.enabled`, l’app **casse** — risque élevé.

**S10 purge Copilot** : grep large → risque de masquer une surface encore utile en dogfood MS.

---

## Critères d’acceptation release

- [x] **S1–S4** faits + smoke fil (switch discussion + dossier)
- [x] Pas de crash OOM sur 10 switches (session réelle)
- [x] **S8** smoke install OK (T1–T3 + layout)
- [x] Pas de régression E2E 1.5.12
- [x] Ship OR `v1.5.13`

*(S9–S11 et S12–S16 non bloquants si deadline serrée.)*

---

## Références externes

| Sujet | Lien |
|-------|------|
| Flux chargement (détail) | [NOTES-CHARGEMENT-FIL.md](NOTES-CHARGEMENT-FIL.md) |
| Webview vs natif | [COMPARE 1.5.11](../1.5.11/COMPARE-WEBVIEW-VS-NATIF.md) |
| Lazy replay 1.3.2 | [PLAN 1.3.2](../../1.3/1.3.2/finalisation/PLAN-CHARGEMENT-SESSION-LAZY-1.3.2.md) |
| Closure 1.5.12 | [CLOSURE-1.5.12.md](../1.5.12/CLOSURE-1.5.12.md) |

---

## Liens

- [README 1.5.13](README.md)
- [Hub 1.5](../README.md)
