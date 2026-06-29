# Guide — Reprise / Recommencer (1.5.10)

**Public** : dev `contrib/drox` · dogfood  
**Code existant** : `droxChatRunRecovery.ts`, `run-recovery.js` (webview)  
**Moteur** : `session.truncateAfterLastUser`, `agent.run` + `skipUserTurn` (déjà en 1.5.7)

---

## Contexte (incident prod)

Symptôme observé ([`docs/chat.txt`](../../chat.txt)) : le modèle boucle en `internal_reasoning` (« je vais créer le fichier ») **sans** invoquer `file_write`. L’utilisateur coupe le run ou change de modèle ; le moteur peut se fermer (`drox client closed`) si la config LLM déclenche un respawn pendant un `agent.run` actif.

**Décision produit 1.5.10** : ne pas durcir les gates anti-boucle côté Rust pour l’instant. Donner à l’utilisateur un **reset conversationnel** fiable via les actions **Reprendre** / **Recommencer** déjà présentes (1.5.7), rendues **toujours accessibles** sur le message utilisateur qui a lancé le run — pas seulement après une erreur moteur.

---

## Comportement actuel (1.5.9)

| Étape | Comportement |
|-------|----------------|
| Envoi user | `setPendingRunRecovery` enregistre `messageId`, `mode`, `enginePrompt`, `images` |
| `agent/done` **succès** | `clearPendingRunRecovery` — plus de reprise possible |
| `agent/done` **erreur** | `runRecoveryOffer` → boutons sur la **ligne user** concernée |
| Annulation manuelle (Stop) | `agent.cancel` + message « Drox: run stopped. » — **pas** d’offre de boutons |
| Pendant `busy` | Boutons **absents** |

Les boutons sont donc visibles **uniquement** après une fin en erreur (`LoopDetected`, crash RPC, etc.).

---

## Comportement cible (1.5.10)

### Principe

Sur le **message utilisateur qui a déclenché le dernier run** (tant que `pendingRunRecovery` existe pour la session) :

| Bouton | Label UI | Effet |
|--------|----------|--------|
| **Recommencer** | `Recommencer` | **Reset propre** — équivalent « urgence » : annule le run si actif → `session.truncateAfterLastUser` → nettoie le fil UI après ce message → `agent.run` avec `skipUserTurn` et le **même** `enginePrompt` / mode / images |
| **Reprendre** | `Reprendre` | **Continue** le transcript moteur tel qu’flushé (y compris tours assistant / tools partiels) → `skipUserTurn` **sans** truncate |

**Recommandation usage** (boucle reasoning, acting vide, modèle défaillant) : **Recommencer**, pas Reprendre.

### Visibilité

| État du run | Boutons sur le message user |
|-------------|----------------------------|
| `busy` (run en cours) | **Visibles** — `Recommencer` enchaîne cancel + restart ; `Reprendre` désactivé ou reporté après fin de tour (à trancher en impl.) |
| Run terminé en erreur | Visibles (déjà le cas) |
| Run annulé par l’utilisateur | Visibles — **ne plus** effacer `pendingRunRecovery` au cancel |
| Run terminé avec succès | Absents — `pending` effacé (inchangé) |

Pas de second bouton « urgence » dédié : **Recommencer** sur le message user couvre le cas.

### Garde-fou respawn moteur (IDE only)

Tant qu’un `agent.run` est actif (`getCurrentRunId()` / `isRunActive()`), **ne pas** appeler `droxEngineService.dispose()` lors d’un changement `drox.architect.model`, `numCtx`, etc.

- Mettre le respawn en **file d’attente**
- Exécuter après `agent/done` ou annulation explicite
- Évite `drox client closed` en plein `tool/exec` (ex. `file_write`)

Fichier cible : `electron-browser/droxEngineConfigContribution.ts`.

---

## Flux « Recommencer » (détail)

```text
1. Utilisateur clique Recommencer sur msg user (messageId = M)
2. Si run actif → agent.cancel(runId) + clear webview stream (comme cancel aujourd’hui)
3. session.truncateAfterLastUser(sessionId)  // transcript moteur : garde jusqu'au dernier user
4. Webview : clearLogAfterUserMessage(M)     // retire reasoning / acting / tools affichés après M
5. agent.run({ skipUserTurn: true, prompt: ctx.enginePrompt, ... })  // modèle courant (config à T)
6. busy: true jusqu'à agent/done
```

Aucun changement Rust requis pour ce flux (RPC déjà exposés).

---

## Flux « Reprendre »

```text
1. Si run actif → refuser ou attendre fin (préférence : refuser pendant busy)
2. Pas de truncate
3. agent.run({ skipUserTurn: true, ... })
4. Le modèle voit l'historique assistant/tool déjà persisté
```

Utile après coupure réseau ou crash **si** la réponse partielle est saine. **Déconseillé** après boucle reasoning.

---

## Points ouverts (implémentation)

| # | Sujet | Proposition |
|---|--------|-------------|
| 1 | Revert fichiers sur Recommencer | **Non** en v1 — seulement reset conversation ; revert reste l’action « Annuler le run » / revert dédié |
| 2 | `ask_user_question` en attente | Bloquer Recommencer ou auto-skip comme `cancelRun` |
| 3 | Historique : boutons sur **tous** les messages user | **Non** — uniquement le message du `pendingRunRecovery` courant (dernier envoi) |
| 4 | Métriques tokens live | Chantier séparé (émission `turn_usage` / `context_usage` moteur) — optionnel 1.5.10 |

---

## Fichiers IDE (prévision)

| Fichier | Changement |
|---------|------------|
| `browser/chat/droxChatRunRecovery.ts` | Exposer `offerRunRecovery` / `emergencyRestart` ; gérer cancel+restart |
| `browser/chat/droxChatSendRun.ts` | Après cancel : proposer recovery au lieu de tout effacer |
| `browser/droxChatAgentEvents.ts` | Option : offrir recovery aussi sur cancel utilisateur |
| `browser/media/droxChat/stream/messages/run-recovery.js` | Afficher boutons dès `pending` ; état pendant `busy` |
| `browser/media/droxChat/bridge/host-message.js` | Nouveau kind ou réutiliser `runRecoveryOffer` au send |
| `electron-browser/droxEngineConfigContribution.ts` | Respawn différé si run actif |

---

## Smoke

- [ ] Run qui boucle en reasoning → **Recommencer** visible sur le msg user **pendant** busy → relance sans pollution transcript
- [ ] Run erreur `LoopDetected` → boutons toujours présents (régression)
- [ ] Run succès → pas de boutons sur le dernier msg user
- [ ] Changer de modèle **pendant** busy → pas de `drox client closed` ; respawn après fin de run
- [ ] **Reprendre** après erreur réseau → reprise transcript partiel

---

## Liens

- [PLAN-1.5.10.md](PLAN-1.5.10.md)
- Release notes 1.5.7 : `skipUserTurn` + `truncateAfterLastUser` (`droxReleaseNotes.ts`)
