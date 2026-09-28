# Clôture 1.5.11 — Chat natif Drox (moteur + portage)

**Date** : juin 2026  
**Version** : `droxVersion` **1.5.11**  
**Statut** : **livré** (smokes OK · release OR **v1.5.11** Windows + Linux)

---

## Périmètre livré (code)

| Pilier | Livrable | Statut |
|--------|----------|--------|
| **M1** | `drox.exe` dans `ChatWidget` (IDE Native + fenêtre Agents) | ✅ |
| **M1** | Composer Drox (serveur, modèle, modes) sur input natif | ✅ |
| **M2** | Cartes file-change + diff + undo dans le fil natif | ✅ |
| **M2** | Images en pièce jointe natif | ✅ |
| **M2** | Historique sessions `.drox/sessions/` + replay UI (`.ui-replay.jsonl`) | ✅ |
| **M2** | Historique partagé IDE Native ↔ fenêtre Agents | ✅ |
| **M2** | Phrases thinking Drox (sans strip TUI rétro) | ✅ |
| **CFG** | Config USER unique (`drox.architect.model`, serveur, mode) IDE ↔ Agents | ✅ |
| **M3** | Identité fonctionnelle (pas de Copilot sur chemin nominal) | ✅ |
| **SHIP** | Canal nominal IDE = natif ; webview masquée (`drox.ideLegacyWebviewChat.enabled`) | ✅ |
| **gelé** | Rebrand vert / strip WORK rétro | reporté post-1.5.11 |

---

## Smokes validés

- Run E2E natif (stream, tools, cancel, ask user)
- CFG modèle / serveur partagé IDE ↔ Agents (live + réouverture fenêtre)
- Historique : reprise session + clic liste Agents
- Webview legacy : toujours disponible via `drox.ideLegacyWebviewChat.enabled` (non-régression)

---

## Technique (points d’entrée)

- Handler : `droxAgentsSessionHandler` · bridge : `droxAgentRunBridge`
- Sink : `droxAgentsChatSink` · replay : `droxNativeUiReplayRecorder`
- IDE Native : `DroxNativeChatViewPane` (canal nominal · `drox.ideNativeChatTab.enabled` défaut true)
- Routage IDE : `droxIdeChatViewRoute.ts`
- Agents : `DroxSessionsProvider` · picker : `sessions/.../modelPicker.ts` (persist USER au clic)
- CFG : `readDroxArchitectModelUser` / `persistDroxArchitectModelUser`
- Historique : `droxSharedChatSessionHistory`

---

## Release OR

| # | Étape | Statut |
|---|--------|--------|
| R1 | Merge `1.5.11` → `main` | ✅ |
| R2 | `npm run drox:ship` Windows | ✅ |
| R3 | Release `v1.5.11` + `stable/latest.json` | ✅ |
| R4 | Linux `.deb` **1.5.11** | ✅ |

---

## Reporté (hors 1.5.11)

- Polish thinking sink avancé (strip WORK)
- Panneau Changes / Files (P3)
- Suppression code webview (masquée par défaut depuis 1.5.11)
- MCP UI complet ([#16](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md))

---

## Liens

- [PLAN-1.5.11.md](PLAN-1.5.11.md)
- [COMPARE-WEBVIEW-VS-NATIF.md](COMPARE-WEBVIEW-VS-NATIF.md)
- [CLOSURE 1.5.10](../1.5.10/CLOSURE-1.5.10.md)
- [Hub 1.5](../README.md)
- [Opérations release](../../operations/README.md)
