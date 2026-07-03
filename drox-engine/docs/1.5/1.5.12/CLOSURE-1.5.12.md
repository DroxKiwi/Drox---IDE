# Clôture 1.5.12 — Polish natif + workspace Cursor

**Date** : juillet 2026  
**Version** : `droxVersion` **1.5.12**  
**Statut** : **livré** (release OR **v1.5.12** Windows + Linux)

---

## Périmètre livré

| Pilier | Livrable | Statut |
|--------|----------|--------|
| **P1** | Reset workspace `.drox/` (IDE + Agents) | ✅ |
| **P2** | Phrases thinking Drox (anti « Working ») | ✅ |
| **P3** | Remote off · `.drox/agents` · branding Drox | ✅ |
| **P4** | Marketplace MCP OSS curated (P4-1/2) | ✅ |
| **P5** | Open in Browser (title bar Agents) | ✅ |
| **P6** | Workspace Cursor (Changes, diff, git composer) | ✅ |
| **P7** | Installateur Windows — purge `extensions/copilot` + OTel | ✅ |

---

## Release OR

| # | Étape | Statut |
|---|--------|--------|
| R1 | Merge `1.5.12` → `main` | ✅ |
| R2 | `npm run drox:ship` Windows | ✅ |
| R3 | Build Linux isolé WSL | ✅ |
| R4 | Release `v1.5.12` + `stable/latest.json` | ✅ |

---

## Reporté (1.5.13+)

- **P4-3** : outils `mcp__*` visibles au run si `drox.tools.mcp.enabled`
- **P8** : purge strings / surfaces Copilot restantes
- Smokes install upgrade Windows (validation manuelle post-ship)

---

## Liens

- [PLAN-1.5.12.md](PLAN-1.5.12.md)
- [README 1.5.12](README.md)
- [Hub 1.5](../README.md)
- [Release OR v1.5.12](https://github.com/DroxKiwi/Drox---IDE---OR/releases/tag/v1.5.12)
