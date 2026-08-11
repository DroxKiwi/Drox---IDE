# 1.5.20 — Bugs résiduels post-1.5.19

**Statut** : **ouvert** · branche `1.5.20`  
**Version** : `droxVersion` **1.5.20**  
**Précédent** : [1.5.19](../1.5.19/README.md) — badge / Git Graph + Ollama ([CLOSURE](../1.5.19/CLOSURE-1.5.19.md))  
**Reporté** : tool calling universel → [1.5.21](../1.5.21/README.md) · index / carte code → [1.5.22](../1.5.22/README.md)

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-RESIDUAL-BUGS.md](PLAN-RESIDUAL-BUGS.md) | Correctifs post-ship 1.5.19 (IDE chat, régressions) |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| A | **Chat IDE natif** — plus possible de parler au modèle | 🔴 prioritaire |
| B | Autres bugs résiduels 1.5.19 (handoff Agents→IDE, empty-state, timeouts, …) | 📋 inventaire |
| C | Smoke Agents + IDE sur workspace réel avant clôture | 📋 |

## Décisions clés

- 1.5.20 = **stabilisation**, pas nouvelle feature majeure.
- Tool calling universel et `@Codebase` restent en backlog (1.5.21 / 1.5.22).
- Critère de sortie : un utilisateur peut **envoyer un message et obtenir une réponse modèle** depuis le panneau Drox IDE (et Agents inchangé / non régressé).
