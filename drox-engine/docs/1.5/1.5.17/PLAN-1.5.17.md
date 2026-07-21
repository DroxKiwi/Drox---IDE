# Plan 1.5.17 — Alignement enveloppe IDE ↔ contrat TUI

**Branche** : `1.5.17`  
**Version** : `droxVersion` **1.5.17**  
**Statut** : **file AMB 1.5.17 clôturée** — suite hors AMB : [PLAN-LLM-CONNECTIONS.md](PLAN-LLM-CONNECTIONS.md)  
**Base** : `main` après clôture 1.5.16  
**README** : [README.md](README.md)  
**Fiches AMB** : [amb/](amb/README.md) — doc par ambiguïté (modifications)

---

## Accord produit (non négociable)

> **On adapte l’interface du fork VS Code (chassis anciennement Copilot) au moteur d’origine TUI — pas l’inverse.**

| | |
|--|--|
| **Source de vérité** | Contrat TUI / `drox-engine` (run-centric, gates locales au `agent.run`) |
| **Ce qu’on change** | Enveloppe IDE (Agents, chat natif, webview si besoin) pour **coller** à ce contrat |
| **Ce qu’on ne fait pas** | Rehydrate gates / plan session-style Copilot dans le Rust ; plier `drive_inner` aux habitudes du widget sticky |

Toute proposition d’implémentation qui « aligne le moteur sur Copilot » est **hors scope** 1.5.17.

**Boussole opérationnelle** : fidélité TUI (Option B) — plan **run-centric**.

---

## En une phrase

À la fin d’un `agent.run`, l’enveloppe IDE ne doit plus laisser un plan « vivant » (ex. 5/6) contredire le run suivant — même contrat d’état que le TUI.

---

## 1. Diagnostic (rappel)

| Couche | Après un run 5/6 | Problème |
|--------|------------------|----------|
| **Moteur** | Gates todo reset au prochain `agent.run` | Vérité run-local |
| **Transcript LLM** | Anciens `todo_write` encore visibles | Le modèle croit le plan actif |
| **UI natif / Agents** | Widget sticky : `clear(..., false)` ne vide **que** si tout `completed` | Plan zombie à l’écran |

Trois vérités → consignes contradictoires → prose « je suis bloqué / je vais écrire » → FX-B / Blocked.

Le moteur TUI / Rust n’est **pas** à réécrire en premier : c’est l’**enveloppe** (surtout chat natif + Agents) qui diverge.

---

## 2. Politique produit proposée (Option B — TUI)

### Règle

**Fin de run = fin de plan vivant UI.**

Quand le moteur rend la main (`agent/done`, tous statuts pertinents : `completed` | `error` | éventuellement cancel déjà géré), pour la session concernée :

1. **Ne plus afficher** un plan incomplet comme plan actif du prochain tour.
2. Politique d’items encore ouverts (à trancher avant code, recommandation ci-dessous) :
   - **Recommandé** : `force clear` du widget (équivalent TUI « le panneau live du run est terminé ») **ou** marquer les restants `cancelled` puis clear — **pas** auto-`completed` (mensonge produit / archives).
3. Le sticky / archive **dans le fil** (historique du tour) peut conserver une vue figée du plan du run — comme le webview `archivePlanIntoStrip` — sans le laisser « actif » pour le message suivant.

### Hors scope P0

- Rehydrate `saw_successful_todo_write_in_run` depuis l’UI (Option A Copilot).
- Changer les gates Rust MUTATING / unfinished / `intent_only_write`.
- Refonte core prompt.
- Forcer le modèle à être déterministe.

### P1 optionnel (après P0 UI)

- Note `system` courte au **début** du run suivant si le transcript contient encore un plan ouvert (« plan précédent archivé ; pose un `todo_write` avant mutation ») — réduit l’ambiguïté **historique**, pas seulement UI.
- Snip / compaction des vieux blocs `todo_write` (plus lourd).

---

## 3. Systèmes à toucher

```text
┌─────────────────────────────────────────────────────────────┐
│  Moteur Rust (agent.rs)                                      │
│  → P0 : NE PAS TOUCHER (gates OK pour contrat TUI)           │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ agent/done
┌─────────────────────────────────────────────────────────────┐
│  Enveloppe IDE — surface principale                          │
│  1. Agents / chat natif  → IChatTodoListService + widget     │
│  2. Chat webview legacy  → sticky / strip (déjà plus run)    │
│  3. (P1) Injection system / recovery send                    │
└─────────────────────────────────────────────────────────────┘
```

| Système | Rôle | Action 1.5.17 |
|---------|------|----------------|
| **Agents sink** | Reçoit `agent/done`, pousse `todoList` toolSpecificData | **P0** : à `handleAgentDone`, forcer fin de plan session |
| **ChatTodoListService / Widget** | Stockage memento + affichage | **P0** : `setTodos([])` ou `clear(..., true)` via API Drox — éviter de casser le soft-clear Copilot global si possible |
| **ChatWidget upstream** | `clearTodoListWidget(session, false)` sur `addRequest` | **Comprendre** ; ne pas changer le soft-clear universel sans nécessité — préférer clear **à done** côté Drox |
| **Webview Drox** | `archivePlanIntoStrip` / `resetPlanStateForTurn` | **Audit** : déjà run-oriented ; aligner si sticky footer laisse un plan « vivant » entre busy |
| **droxChatAgentHost / recovery** | Fin busy, retry | S’assurer que **tous** les chemins de fin de run (error, cancel, recovery) passent par la même politique |
| **TUI** | Référence comportementale | **Référence seule** — pas de modif requise |
| **Rust agent.rs** | Gates | **P0 : non** |

---

## 4. Fichiers / symboles (carte d’implémentation)

### P0 — natif / Agents (prioritaire)

| Fichier | Symbole | Modification voulue |
|---------|---------|---------------------|
| `src/vs/workbench/contrib/drox/browser/agents/droxAgentsChatSink.ts` | `handleAgentDone` | Aujourd’hui : phase clear + pending tools **seulement**. **Ajouter** : clôture plan session (`IChatTodoListService.setTodos(session, [])` ou clear force) pour la `sessionResource` du chat Agents |
| `src/vs/workbench/contrib/drox/browser/agents/droxAgentsSessionHandler.ts` | notif `agent/done` → sink | Vérifier que **error / completed / cancelled** atteignent bien `handleAgentDone` ; pas de chemin qui skip la politique |
| `src/vs/workbench/contrib/chat/common/tools/chatTodoListService.ts` | `setTodos`, memento | Utiliser l’API existante ; pas forcément forker le service |
| `src/vs/workbench/contrib/chat/browser/widget/chatContentParts/chatTodoListWidget.ts` | `clear(session, force)` | `force: true` vide toujours ; **préférer** appeler depuis Drox plutôt que changer la sémantique soft (`force \|\| all completed`) pour tout Copilot |
| Accès session URI | (à identifier dans handler/sink) | Besoin du `sessionResource` Agents au moment du done — câblage actuel à tracer à l’implémentation |

### P0 — webview legacy (parité)

| Fichier | Symbole | Modification voulue |
|---------|---------|---------------------|
| `.../media/droxChat/stream/timeline/strip.js` | `archivePlanIntoStrip`, busy→false | Confirmer qu’à fin de busy le plan n’est plus sticky « actif » ; si oui, doc « déjà conforme » ; sinon aligner |
| `.../browser/chat/droxChatAgentHost.ts` / `droxChatAgentEvents.ts` | `dispatchAgentDone`, `busy: false` | Point d’accroche webview pour la même politique si besoin |

### P1 — contexte LLM (optionnel)

| Fichier | Modification voulue |
|---------|---------------------|
| `droxChatSendRun.ts` / `droxAgentsSessionHandler` (build messages) | Si plan archivé au done précédent : injecter une ligne system courte au run suivant |
| Rust | **Éviter** sauf si on décide de snip transcript (hors P0) |

### Tests

| Zone | Idée |
|------|------|
| Unit sink / handler | `agent/done` → todos session vides |
| Smoke manuel | Plan 5/6 → done/error → nouveau « édite X » : widget vide ; pas de contradiction visuelle |

---

## 5. Comment faire la transition (étapes)

```text
1. Valider politique : force clear vs cancelled-then-clear (recommandé : force clear UI)
2. Tracer sessionResource dans le chemin Agents jusqu’à handleAgentDone
3. Implémenter clear force à agent/done (completed + error)
4. Vérifier cancel (déjà clear force côté ChatWidget ?) — ne pas double-clear destructif
5. Audit webview strip / sticky — parité ou no-op documenté
6. Smoke scénario boucle édition post-1.5.16
7. (P1) note system run suivant si encore nécessaire
8. CLOSURE + ship
```

**Ordre de risque croissant** : UI clear à done → parité webview → note system → (plus tard) snip transcript.

---

## 6. Impact

| Acteur | Impact |
|--------|--------|
| **Utilisateur** | Le plan incomplet disparaît (ou s’archive dans le fil) à la fin du run — plus de barre 5/6 au message suivant. Peut surprendre si on s’en servait comme checklist persistante inter-tours. |
| **Modèle** | Moins de signal « plan encore ouvert » côté UI ; gates moteur déjà reset — **alignement**. Historique transcript peut encore mentionner d’anciens todos (P1). |
| **Produit TUI** | Inchangé ; IDE se rapproche. |
| **Copilot non-Drox** | Si on ne touche qu’au sink Drox + `force` local : **faible**. Si on change `clear` soft upstream : **élevé** — à éviter. |
| **Moteur / releases** | Pas de nouveau binaire Rust si P0 UI only. |

---

## 7. Effets de bord potentiels

| Risque | Gravité | Mitigation |
|--------|---------|------------|
| Perte du rappel visuel « il restait une étape » | Moyenne | Archive dans le strip / message du run ; pas completed auto |
| Double clear (done + cancel) | Faible | Idempotent `setTodos([])` |
| `agent/done` error sans clear | Haute si oublié | Même hook pour `status: error` |
| Retry / recovery laisse le plan | Moyenne | Clear au done du run échoué ; le retry = nouveau run = widget vide (conforme TUI) |
| Memdir « archive quand plan fully green » | Faible–moyenne | Clear UI ≠ `todo_write` completed ; archives moteur inchangées si pas de faux completed |
| Replay historique / ui-replay | Faible | Les `todoUpdate` passés restent dans le fil ; seul le widget session change |
| Ids todo string→int widget | Incertain | Hors scope sauf régression affichage |
| Utilisateurs qui veulent un plan multi-messages | Produit | Assumer contrat TUI ; documenter dans notes de release |

---

## 8. Critères d’acceptation

- [ ] Après `agent/done` (success **et** error) sur Agents/natif : plus de plan session actif incomplet
- [ ] Scénario : plan 5/6 → fin de run → « édite autre chose » : UI ne montre plus 5/6 vivant ; smoke édition sans contradiction évidente
- [x] Pas de changement soft-clear Copilot global (sauf justification écrite)
- [x] Webview : comportement documenté conforme — `sealRunStrip` / `archivePlanIntoStrip` + `resetPlanStateForTurn` déjà run-centric (**pas de modif P0**)
- [ ] Pas de régression 1.5.15–1.5.16 (OW, Retry, carnet, intent_only_write)
- [x] Rust P0 : **aucune** diff moteur

### Implémentation P0 (faite)

- `droxAgentsChatSink.ts` : `onAgentRunEnded` à chaque `handleAgentDone`
- `droxAgentsSessionHandler.ts` : `chatTodoListService.setTodos(sessionResource, [])`
- Test unitaire : `handleAgentDone invokes onAgentRunEnded for completed and error`

---

## 9. Décisions à figer avant code

1. **Clear force** vs **cancelled puis clear** pour items ouverts ? → reco : **force clear** widget (simple, honnête).
2. Clear aussi sur `agent/done` **error** ? → reco : **oui**.
3. P1 note system dès 1.5.17 ou report ? → reco : **report** si smoke UI suffit.
4. Webview : travail réel ou « déjà OK » ? → **audit en premier commit doc/impl**.

---

## 10. File AMB (après P0 UI)

Ordre : **08 → 16 → 12 → 05 → 01-P1 → 09/18** — détail dans [AMBIGUITIES-IDE-TUI.md](AMBIGUITIES-IDE-TUI.md) et fiches [amb/](amb/README.md).

Chaque patch : code + fiche `amb/AMB-XX-….md` remplie + statut inventaire.

---

## Références

- Analyse post-1.5.16 (désync plan / enveloppe / TUI vs IDE)
- [PLAN-1.5.16.md](../1.5.16/PLAN-1.5.16.md) · [ENGINE-RUST-1.5.16.md](../1.5.16/ENGINE-RUST-1.5.16.md)
- [AMBIGUITIES-IDE-TUI.md](AMBIGUITIES-IDE-TUI.md) · [amb/](amb/README.md)
- TUI : `drox-tui` `todo_panel.rs` · IDE : `droxAgentsChatSink.handleAgentDone`, `ChatTodoListWidget.clear`
- Upstream soft-clear : `chatWidget.ts` `clearTodoListWidget(..., false)` sur nouveau request
