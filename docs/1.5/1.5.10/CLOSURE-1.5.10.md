# Clôture 1.5.10 — Run recovery & respawn moteur

**Date** : juin 2026  
**Version** : `droxVersion` **1.5.10**  
**Statut** : **livré**

---

## Périmètre livré (code)

| # | Livrable | Statut |
|---|----------|--------|
| P1 | Respawn moteur **différé** tant qu’un `agent.run` est actif | ✅ |
| P2 | **Reprendre** / **Recommencer** toujours sur le dernier message user | ✅ |
| P2b | Persistance recovery après reload IDE (`.run-recovery.json`) | ✅ |
| P3 | Métriques tokens / contexte **live** (`turn_usage`) | ✅ |
| P4 | Composer : padding intérieur du champ de saisie | ✅ |

---

## Technique

- `droxEngineConfigContribution.ts` : file d’attente respawn + flush via `onDidChangeRunId`.
- `droxChatRunRecovery.ts` + `droxRunRecoveryPersist.ts` : recovery en mémoire + disque, restauration après `sessionReplayDone`.
- `drox-engine` : `ContextUsage`, `TurnUsage` émis avant/après chaque tour LLM.
- `run-recovery.js` : boutons sur le dernier message user (y compris après rejeu historique).

---

## Release OR

| # | Étape | Statut |
|---|--------|--------|
| R1 | Merge `1.5.10` → `main` | ✅ |
| R2 | `npm run drox:ship` Windows | ✅ |
| R3 | Release `v1.5.10` + `stable/latest.json` | ✅ |
| R4 | Linux `.deb` **1.5.10** | reporté (win d’abord) |

---

## Liens

- [PLAN-1.5.10.md](PLAN-1.5.10.md)
- [GUIDE-RUN-RECOVERY.md](GUIDE-RUN-RECOVERY.md)
- [CLOSURE 1.5.9](../1.5.9/CLOSURE-1.5.9.md)
- [Hub 1.5](../README.md)
