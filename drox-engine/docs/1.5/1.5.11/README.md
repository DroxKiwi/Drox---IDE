# Drox 1.5.11 — Chat natif Drox (moteur + portage)

**Statut** : **livré** · release OR [**v1.5.11**](https://github.com/DroxKiwi/Drox---IDE---OR/releases/tag/v1.5.11) (Windows + Linux)  
**Prérequis** : [1.5.10](../1.5.10/README.md) livrée (`v1.5.10`)

---

## En une phrase

Mettre **`drox.exe`** dans le **chat natif** VS Code (châssis Copilot-style, sans Copilot cloud), porter le fonctionnel utile du webview (diff, images, replay, historique), config **partagée** IDE ↔ fenêtre Agents — **panneau IDE = natif par défaut** (webview legacy masquée).

---

## Périmètre livré

| Pilier | Contenu |
|--------|---------|
| **M1** | Moteur dans flux `ChatWidget` (IDE Native + Agents) |
| **M2** | Portage sélectif + historique sessions partagé IDE ↔ Agents |
| **CFG** | `drox.architect.model` / serveur en scope USER unique |
| **M3** | Composer Drox, pas de Copilot nominal (rebrand visuel gelé) |
| **SHIP** | Canal nominal IDE natif ; webview `drox.ideLegacyWebviewChat.enabled` |

---

## Docs

- [PLAN-1.5.11.md](PLAN-1.5.11.md) — plan · critères d’acceptation
- [CLOSURE-1.5.11.md](CLOSURE-1.5.11.md) — clôture + checklist release OR
- [COMPARE-WEBVIEW-VS-NATIF.md](COMPARE-WEBVIEW-VS-NATIF.md) — écarts webview vs natif
- [IMPLEMENTATION-1.5.11.md](IMPLEMENTATION-1.5.11.md) — détail technique

---

## Liens

- [Hub 1.5](../README.md)
- [Opérations release](../../operations/README.md)
