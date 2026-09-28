# 1.5.20 — Stabilisation + Historique + Changes IDE

**Statut** : **ouvert** · branche `1.5.20`  
**Version** : `droxVersion` **1.5.20**  
**Précédent** : [1.5.19](../1.5.19/README.md) — badge / Git Graph + Ollama ([CLOSURE](../1.5.19/CLOSURE-1.5.19.md))  
**Suite** : shell discussion unifié Agents ↔ IDE → [1.5.21](../1.5.21/README.md)  
**Reporté** : tool calling universel → [1.5.22](../1.5.22/README.md) · index / carte code → [1.5.23](../1.5.23/README.md)

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-HISTORY-AND-CHANGES-IDE.md](PLAN-HISTORY-AND-CHANGES-IDE.md) | **Plan principal** historique + Changes IDE + multi-git |
| [PLAN-RESIDUAL-BUGS.md](PLAN-RESIDUAL-BUGS.md) | Load IDE, Muse, inventaire résiduel |
| [AUDIT-IDE-CHAT-LOADING.md](AUDIT-IDE-CHAT-LOADING.md) | Audit timeout / overlay « Loading session… » |
| [AUDIT-MUSE-GLIMMER-LOOP.md](AUDIT-MUSE-GLIMMER-LOOP.md) | Audit boucle thinking Muse Glimmer |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | Chat IDE — overlay off + soft-fail / empty-first + wait provider | ✅ |
| B | Historique Agents — delete / multi-delete / groupes / recency | ✅ |
| C | Historique IDE — mêmes features, filtre dossier ouvert | ✅ |
| D | Changes IDE — même UX, catégories multi-repos git sous parent | ✅ |
| E | Muse Glimmer — boucle thinking (piste parallèle) | 📋 audit fait |
| F | Smoke Agents + IDE | ✅ tests unitaires + checklist |

## Décisions clés

- 1.5.20 = **stabilisation** + **port UX** History/Changes IDE (pas unification du shell discussion).
- Historique IDE = discussions du **répertoire ouvert** uniquement.
- Changes IDE = 1 catégorie / root git ; parent multi-projets → N catégories.
- Outils agent restent sur `folders[0]` ; multi-git = affichage Changes seulement.
- Commit/Push IDE hors scope (SCM natif).
- Critère de sortie : chat IDE utilisable + historique fiable (Agents & IDE) + Changes IDE multi-git.
- **Chrome discussion IDE ≠ Agents** (ChatWidget Copilot vs shell sessions) → chantier **[1.5.21](../1.5.21/PLAN-SHARED-DISCUSSION-SHELL.md)**.
