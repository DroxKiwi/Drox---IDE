# Ligne de version 1.5

**Prérequis** : [1.4.2](../1.4/1.4.2/README.md) tag `v1.4.2` · refonte moteur **profonde**

---

## Statut actuel

| Dossier | Périmètre | Statut |
|---------|-----------|--------|
| [**1.5.0/**](1.5.0/README.md) | Moteur TUI + shim IDE | **Clôturé** · `v1.5.0` |
| [**1.5.1/**](1.5.1/README.md) | Fil chat / TUI + wizard connexion | **Livré** · `v1.5.1` |
| [**1.5.1b/**](1.5.1b/README.md) | Scripts pipeline Linux | **Préparé** · ship → **1.5.4** |
| [**1.5.2/**](1.5.2/README.md) | Configuration moteur depuis l’IDE | **Livré** · `v1.5.2` |
| [**1.5.3/**](1.5.3/README.md) | Diffs fil + UX chat + splash | **Livré** · `v1.5.3` |
| [**1.5.4/**](1.5.4/README.md) | Release Linux `.deb` + Authenticode + marketplace extensions | **Livré** · `v1.5.4` |
| [**1.5.5/**](1.5.5/README.md) | Fil chat — layout multi-tours (superposition) | **Livré** · `v1.5.5` |
| [**1.5.6/**](1.5.6/README.md) | Correctifs post-release 1.5.5 | **Livré** · `v1.5.6` |
| [**1.5.7/**](1.5.7/README.md) | Correctifs post-release 1.5.6 | **Livré** · `v1.5.7` |
| [**1.5.8/**](1.5.8/README.md) | Polish UX post-release 1.5.7 | **Livré** · `v1.5.8` |
| [**1.5.9/**](1.5.9/README.md) | Scroll fil, reset `MEMORY.md`, composer épuré | **Livré** · `v1.5.9` |
| [**1.5.10/**](1.5.10/README.md) | Run recovery toujours dispo + respawn moteur différé | **Livré** · `v1.5.10` |
| [**1.5.11/**](1.5.11/README.md) | Chat natif Drox + CFG IDE ↔ Agents + historique partagé | **Livré** · `v1.5.11` |
| [**1.5.12/**](1.5.12/README.md) | Polish + workspace Cursor + MCP marketplace | **Livré** · `v1.5.12` |
| [**1.5.13/**](1.5.13/README.md) | Stabilisation Agents (fil · perf · crash) | **Clôturé** · `v1.5.13` |
| [**1.5.14/**](1.5.14/README.md) | LoopDetector, loading UI, Plan B sessions | **Livré** · `v1.5.14` |
| [**1.5.15/**](1.5.15/README.md) | Hors workspace · Retry · carnet session | **Livré** · `v1.5.15` |
| [**1.5.16/**](1.5.16/README.md) | Stabilisation modèle (hors-WS wiring · boucle write) | **Livré** · `v1.5.16` |
| [**1.5.17/**](1.5.17/README.md) | Alignement enveloppe IDE ↔ contrat TUI + connexions LLM runtime | **Livré** |
| [**1.5.18/**](1.5.18/README.md) | Reprise / hang IDE + stop-edit type Cursor | **Livré** · `v1.5.18` |
| [**1.5.19/**](1.5.19/README.md) | Badge branche + Git Graph natif Drox | **Livré** · `v1.5.19` |
| [**1.5.20/**](1.5.20/README.md) | Stabilisation + historique + Changes IDE (multi-git) | **Ouvert** |
| [**1.5.21/**](1.5.21/README.md) | Index `@Codebase` (BDD vectorielle) + **Explore IDE** | **En cours** |
| [**1.5.22/**](1.5.22/README.md) | Shell discussion partagé Agents ↔ IDE | **Préparé** |
| [**1.5.23/**](1.5.23/README.md) | Tool calling universel | **Préparé** |

---

## Séquence

```text
1.5.1  fil + wizard  →  clôture (release win, merge main, branche 1.5.2)
1.5.2  configuration moteur IDE  →  clôture (release win, merge main, branche 1.5.3)
1.5.3  diffs + UX + splash
1.5.4  release Linux + Open VSX + Ouvrir avec Drox
1.5.5  correctif fil chat (layout multi-tours)  →  livré
1.5.6  correctifs post-release 1.5.5  →  livré
1.5.7  correctifs post-release 1.5.6  →  livré
1.5.8  polish UX post-1.5.7  →  livré
1.5.9  scroll fil + reset MEMORY.md + composer épuré  →  livré
1.5.10  run recovery + respawn différé  →  livré
1.5.11  chat natif + CFG + historique partagé  →  livré
1.5.12  polish + workspace Cursor (changes, onglets, MCP)  →  livré
1.5.13  stabilisation Agents (fil · perf · crash)  →  clôturé (merge main, branche conservée)
1.5.14  Plan B sessions + loading + LoopDetector  →  livré
1.5.15  hors workspace · retry · carnet  →  livré
1.5.16  stabilisation modèle (hors-WS · boucle write)  →  livré
1.5.17  alignement enveloppe IDE ↔ contrat TUI (plan / run)  →  ouvert
MCP  →  brainstorm #16
```

---

## Liens

- [PLAN 1.5.17](1.5.17/PLAN-1.5.17.md)
- [PLAN 1.5.16](1.5.16/PLAN-1.5.16.md)
- [Clôture 1.5.16](1.5.16/CLOSURE-1.5.16.md)
- [PLAN 1.5.1](1.5.1/PLAN-1.5.1.md)
- [PLAN 1.5.2](1.5.2/PLAN-1.5.2.md)
- [PLAN 1.5.3](1.5.3/PLAN-1.5.3.md)
- [PLAN 1.5.4](1.5.4/PLAN-1.5.4.md)
- [PLAN 1.5.5](1.5.5/PLAN-1.5.5.md)
- [PLAN 1.5.6](1.5.6/PLAN-1.5.6.md)
- [PLAN 1.5.7](1.5.7/PLAN-1.5.7.md)
- [PLAN 1.5.8](1.5.8/PLAN-1.5.8.md)
- [PLAN 1.5.9](1.5.9/PLAN-1.5.9.md)
- [PLAN 1.5.10](1.5.10/PLAN-1.5.10.md)
- [PLAN 1.5.11 Agents](1.5.11/PLAN-1.5.11.md)
- [PLAN 1.5.12](1.5.12/PLAN-1.5.12.md)
- [PLAN 1.5.13](1.5.13/PLAN-1.5.13.md)
- [PLAN 1.5.14](1.5.14/PLAN-1.5.14.md)
- [Brainstorm MCP #16](../feature-brainstorm/16-connexions-mcp-ui-moteur.md)
- [GUIDE release & upstream](../GUIDE-RELEASE-ET-UPSTREAM.md)
- [Opérations release (index)](../operations/README.md)
