# Plan 1.5.14 — Suite post-stabilisation Agents

**Version** : juillet 2026  
**Base** : [1.5.13](../1.5.13/PLAN-1.5.13.md) livrée · OR `v1.5.13`  
**Branche** : `1.5.14` · tag cible **`v1.5.14`**

---

## En une phrase

Après la **stabilisation fenêtre Agents** (1.5.13), brancher le **MCP au run**, avancer la **purge Copilot / Microsoft** (P8), et traiter les **reports perf / nettoyage** laissés en attente.

---

## Périmètre

| **Dans ce plan** | **Hors scope / reporté** |
|------------------|---------------------------|
| P4-3 outils `mcp__*` au run | Réactivation surface Microsoft |
| P8 purge UI / bundle (suite) | Bump base VS Code upstream |
| S5–S7 perf caches / replay tail | S18 build conditionnel JS legacy |
| S12–S16 nettoyage Tier A | Suppression webview legacy (risque élevé) |
| Smokes install + Agents | |

Reports depuis [PLAN 1.5.13](../1.5.13/PLAN-1.5.13.md) : S5–S7, S9–S11, S12–S16.

---

## État d'avancement

| Pilier | Avancement |
|--------|------------|
| **P4-3** MCP au run | ouvert |
| **P8** Purge Copilot / MS | ouvert |
| **S5–S7** Perf / replay | ouvert |
| **S12–S16** Nettoyage Tier A | ouvert |
| **QA** Smokes release | ouvert |

---

## Critères d'acceptation (brouillon)

- [ ] Run Drox : serveurs MCP installés exposent des outils `mcp__*`
- [ ] Aucune régression E2E 1.5.13 (fil au switch, layout boot, stream arrière-plan)
- [ ] Smoke install Windows upgrade sans erreur NSIS
- [ ] Bump `droxVersion` 1.5.14 + ship OR

---

## Liens

- [README 1.5.14](README.md)
- [CLOSURE 1.5.13](../1.5.13/CLOSURE-1.5.13.md)
- [Brainstorm MCP #16](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md)
