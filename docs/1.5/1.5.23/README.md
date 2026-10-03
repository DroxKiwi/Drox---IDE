# 1.5.23 — Polish dogfood · Explore · Port forwarding

**Statut** : ✅ **clôturé** · branche `1.5.23` · `droxVersion` **1.5.23** · [CLOSURE](CLOSURE-1.5.23.md)  
**Précédent** : [1.5.22](../1.5.22/README.md) — **clôturé** ([CLOSURE](../1.5.22/CLOSURE-1.5.22.md)) · ship `v1.5.22`  
**Reporté depuis 1.5.22** : PF · Explore IDE  
**Hors maj** : Théming → [PLAN-THEMING](PLAN-THEMING.md) (backlog ultérieur)

## Cap

1. **Polish dogfood** — badge Changes, switch Agents/IDE, auth Copilot, cockpit embed, terminaux agent, onglet Traffic  
2. **Explore (sub-agents)** — câbler `task` / Explore dans l’IDE (moteur déjà prêt)  
3. **Port forwarding** — cadrage + MVP (exposition locale via configuration, sans service cloud tiers)

## Avancement

| Volet | État |
|-------|------|
| UX polish (badge, switch, auth, embed, terminaux, Traffic) | ✅ |
| Traffic tags / alertes (liste, remove, match partiel, rétroactif) | ✅ |
| Skin cockpit Traffic / Codebase / Regulation (alléger le vert) | ✅ |
| Explore IDE (settings + bridge + gate L2 + cartes chat / Agents) | ✅ |
| Port forwarding (config + outil extérieur + vue Ports) | ✅ MVP |
| RELEASE_NOTES / CLOSURE / ship | ✅ |

## Docs

| Fiche | Sujet |
|-------|--------|
| [CLOSURE-1.5.23.md](CLOSURE-1.5.23.md) | Clôture |
| [PLAN-UX-POLISH.md](PLAN-UX-POLISH.md) | Backlog polish dogfood |
| [PLAN-SUBAGENTS-EXPLORE.md](PLAN-SUBAGENTS-EXPLORE.md) | Explore (`task`) dans Drox IDE |
| [PLAN-PORT-FORWARDING.md](PLAN-PORT-FORWARDING.md) | Ports / forward configurable |
| [PLAN-THEMING.md](PLAN-THEMING.md) | ⏸ reporté hors 1.5.23 |
| [`stable/1.5.23/RELEASE_NOTES.md`](../../../stable/1.5.23/RELEASE_NOTES.md) | Notes release |

## Décisions

- **THEME hors 1.5.23** — pas de jalon théming dans cette maj.  
- Explore = master `drox.subagents.enabled` **et** L2 ∈ { `standard`, `full` }.  
- MITM v0 = trafic Drox (LLM / embed / MCP), pas un proxy OS global.  
- PF Drox : **pas de dépendance** à un compte / tunnel cloud tiers ; **config déclarative** (`drox.ports.*`) + **outil extérieur** interchangeable (ssh / socat / script) — pas de réécriture de la stack Ports amont.
