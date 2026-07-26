# 1.5.19 — Export transcript complet (surface dev)

**Statut** : livré (natif IDE) · **Date** : 2026-07-26  
**Plan** : [PLAN-MUTATORS-AND-TRANSCRIPT-EXPORT.md](PLAN-MUTATORS-AND-TRANSCRIPT-EXPORT.md) workstream B

## But

Pouvoir **copier / sauvegarder** un run agent complet (réflexion / thinking, réponse, outils) pour le partager (ex. smoke → assistant), sans reconstituer manuellement le fil.

## Comportement

| Surface | Accès |
|---------|--------|
| Chat webview Drox | Bouton header déjà gated `exportTranscript` |
| Chat **natif IDE** | Action ViewTitle + F1 : **Export Full Transcript (Dev)** (`drox.nativeChat.exportTranscript`) |

**Gate** : `isDroxDevFeatureEnabled('exportTranscript')` + `product.droxSurface === 'dev'`. En release : warn, pas d’export.

**Sortie**

- Fichiers : `<workspace>/.drox/exports/transcript-ses_…-<stamp>.txt` + `latest-transcript.txt`
- Presse-papiers : texte intégral (ou pointeur fichier si > 2M chars)

**Contenu** (pipeline existante `formatDroxCombinedSessionExport`)

- PARTIE A — ui-replay (phases, thinking, answering, tools start/finish)
- PARTIE B — transcript moteur
- C–E — JSONL / roster / engine-trace selon dispo

## Fichiers

| Fichier | Changement |
|---------|------------|
| `browser/chat/droxChatTranscriptExport.ts` | `exportDroxSessionTranscript({ sessionId })` extrait ; `handleDroxExportTranscript` délègue |
| `browser/chat/droxNativeChatViewActions.ts` | Action `drox.nativeChat.exportTranscript` |
| `browser/chat/droxNativeChatViewPane.ts` | getter `engineSessionId` |

## Smoke

1. Build **dev** → panneau chat natif → icône export / F1 « Export Full Transcript ».  
2. Après un run avec tools → export → coller dans un éditeur : thinking + tool names + réponse visibles.  
3. Build **release** → l’action avertit « dev surface only ».
