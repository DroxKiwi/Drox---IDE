# Plan 1.5.13 — Suite post-workspace Cursor

**Version** : juillet 2026  
**Base** : [1.5.12](../1.5.12/PLAN-1.5.12.md) livrée · OR `v1.5.12`  
**Branche** : `1.5.13` · tag cible **`v1.5.13`**

---

## En une phrase

Après le **workspace Agents façon Cursor** (1.5.12), brancher le **MCP au run**, fermer les **smokes release**, et avancer la **purge Copilot / Microsoft** (P8).

---

## Périmètre

| **Dans ce plan** | **Hors scope / reporté** |
|------------------|---------------------------|
| P4-3 outils `mcp__*` au run | Réactivation surface Microsoft |
| P8 purge UI / bundle (suite) | Bump base VS Code upstream |
| Smokes install + Agents | |

---

## État d'avancement

| Pilier | Avancement |
|--------|------------|
| **P4-3** MCP au run | ouvert |
| **P8** Purge Copilot / MS | ouvert |
| **QA** Smokes release | ouvert |

---

## Critères d'acceptation (brouillon)

- [ ] Run Drox : serveurs MCP installés exposent des outils `mcp__*`
- [ ] Aucune régression E2E 1.5.12 (Changes, composer git, chat natif)
- [ ] Smoke install Windows upgrade sans erreur NSIS
- [ ] Bump `droxVersion` 1.5.13 + ship OR

---

## Liens

- [README 1.5.13](README.md)
- [CLOSURE 1.5.12](../1.5.12/CLOSURE-1.5.12.md)
