# Notes — flux chargement fil (1.5.13)

**Complément** de [PLAN-1.5.13.md](PLAN-1.5.13.md) · étapes **S1–S4**, **S7**.

---

## Chaîne d’appels

```text
SessionsView → SessionsService.openSession
  → SessionView.openSession → ChatView.setChat
    → acquireOrLoadSession
      → getOrCreateChatSession → DroxAgentsSessionHandler.provideChatSessionContent
        → readUiReplay / readSession
      → ChatWidget.setModel
```

## Fichiers

| Rôle | Chemin |
|------|--------|
| Vue chat | `src/vs/sessions/contrib/chat/browser/chatView.ts` |
| Handler historique | `src/vs/workbench/contrib/drox/browser/agents/droxAgentsSessionHandler.ts` |
| I/O replay | `src/vs/workbench/contrib/drox/electron-browser/droxSessionService.ts` |
| Cache sessions | `src/vs/workbench/contrib/chat/browser/chatSessions/chatSessions.contribution.ts` |
| Provider | `src/vs/sessions/contrib/providers/drox/browser/droxSessionsProvider.ts` |
| ProjectBar | `src/vs/sessions/browser/parts/projectBarPart.ts` |

## Matrice symptôme → étape PLAN

| Symptôme | Étape |
|----------|-------|
| Vide après changement dossier | **S1** |
| Vide persistant après 1er échec | **S3** |
| Vide intermittent, reclic inutile | **S2** |
| Lent / crash sessions longues | **S4**, **S7** |

## Capture smoke (juil. 2026)

Workspace `rtr-trastemp-v2` — message user visible, réponses absentes → rebind UI ou historique `[]` (S1/S2/S3).
