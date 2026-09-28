# Plan 1.5.10 — Run recovery toujours dispo + respawn moteur

**Version** : juin 2026  
**Base** : [1.5.9](../1.5.9/PLAN-1.5.9.md) livrée  
**Branche** : `1.5.10` · tag cible **`v1.5.10`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **P0** Doc & périmètre | fait | — |
| **P1** Respawn moteur différé si `agent.run` actif | fait | — |
| **P2** Reprendre / Recommencer toujours sur msg user | fait | — |
| **P3** (optionnel) Métriques tokens live (`turn_usage`) | partiel code | non |
| **P4** Smoke + ship OR | fait | — |

---

## Périmètre

| In | Hors scope |
|----|------------|
| Boutons **Reprendre** / **Recommencer** visibles sur le message user du run courant (y compris pendant `busy` pour Recommencer) | Durcissement anti-boucle Rust (`LoopDetector`, gates `todo_write`, etc.) |
| **Recommencer** = cancel + `truncateAfterLastUser` + `skipUserTurn` (reset « urgence » sans nouveau bouton) | Connexions MCP → [brainstorm #16](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md) |
| Respawn processus moteur **reporté** tant qu’un run est actif | Agents Window → [1.5.11](../1.5.11/README.md) |
| Doc incident [`chat.txt`](../../chat.txt) + [GUIDE-RUN-RECOVERY.md](GUIDE-RUN-RECOVERY.md) | Revert disque automatique sur Recommencer (v1) |

---

## Motivation

Dogfood prod : modèle bloqué en boucle reasoning sans `file_write` ; changement de modèle en plein run → `drox client closed`. La mécanique **Recommencer** (1.5.7) fait déjà le reset transcript correct ; elle n’est proposée qu’après **erreur** moteur. Objectif 1.5.10 : la rendre **toujours disponible** sur le message utilisateur concerné.

---

## P1 — Respawn moteur différé

### Problème

`DROX_ENGINE_RESPAWN_SETTINGS` (dont `drox.architect.model`) appelle `droxEngineService.dispose()` immédiatement → tue `drox-cli` et les RPC en vol (`tool/exec`, `agent.run`).

### Solution

- Si `isRunActive()` : enqueue respawn + notification « appliqué après la fin du run »
- Sinon : comportement actuel

### Fichiers

- `src/vs/workbench/contrib/drox/electron-browser/droxEngineConfigContribution.ts`
- (option) `common/droxEngineService.ts` — flag / file d’attente

### Smoke

- [ ] Changer de modèle pendant un run long → pas de `drox client closed` ; nouveau modèle actif au run suivant

---

## P2 — Recovery toujours sur message user

### Problème

| Cas | Aujourd’hui |
|-----|-------------|
| Erreur moteur | Boutons OK |
| Annulation utilisateur | Pas de boutons ; `pending` reste en mémoire mais invisible |
| Boucle sans erreur (busy) | Pas de boutons |

### Solution

1. Après chaque `executeDroxChatSend` réussi : `runRecoveryOffer` sur le `messageId` user (pas seulement après erreur).
2. Ne pas `clearPendingRunRecovery` sur cancel manuel.
3. **Recommencer** pendant `busy` : `cancel` puis enchaîner `startRecoveryRun(..., restart: true)` (un clic).
4. **Reprendre** : désactivé pendant `busy` (ou après cancel seulement).
5. Succès `agent/done` : `clearPendingRunRecovery` inchangé.

### Fichiers

- `browser/chat/droxChatRunRecovery.ts`
- `browser/chat/droxChatSendRun.ts`
- `browser/droxChatAgentEvents.ts`
- `browser/media/droxChat/stream/messages/run-recovery.js`
- `browser/media/droxChat/bridge/host-message.js`

Détail : [GUIDE-RUN-RECOVERY.md](GUIDE-RUN-RECOVERY.md)

### Smoke

- [ ] Boucle reasoning → Recommencer visible et fonctionnel pendant busy
- [ ] Stop manuel → boutons toujours sur le msg user
- [ ] Run OK → pas de boutons

---

## P3 — Métriques tokens live (optionnel)

Correctif déjà amorcé en dev : `ContextUsage` + `TurnUsage` côté moteur, relayés par `droxChatAgentEvents.ts`. Non bloquant pour la release si P1+P2 livrés.

---

## Critères de clôture

- [x] P1 + P2 validés en dogfood
- [x] [GUIDE-RUN-RECOVERY.md](GUIDE-RUN-RECOVERY.md) à jour
- [x] `droxVersion` **1.5.10** · smoke · ship OR
- [x] `CLOSURE-1.5.10.md` + merge `1.5.10` → `main`

---

## Liens

- [README 1.5.10](README.md)
- [GUIDE run recovery](GUIDE-RUN-RECOVERY.md)
- [MCP reporté brainstorm #16](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md)
- [Agents Window 1.5.11](../1.5.11/README.md)
