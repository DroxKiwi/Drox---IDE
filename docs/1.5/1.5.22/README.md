# 1.5.22 — Auto-régulation + reportés 1.5.21

**Statut** : **en cours** · branche `1.5.22`  
**Version cible** : `droxVersion` **1.5.22**  
**Précédent** : [1.5.21](../1.5.21/README.md) — Codebase CB4/CB4b · shell discussion  
**Suite** : libre (plus de 1.5.23 réservé)

## Ordre d’exécution (figé)

1. **CB3b** — catalogue admin index (cockpit)  
2. **A–D** — auto-régulation modèle (roadmap R0–R11)  
3. Explore / SAV / CB5 — **à arbitrer après**  
4. **Port forwarding** — renseigner VS Code + MVP local / service user (**avant-avant-dernier**)  
5. **Parité Agents** — exposer côté Agents ce qui est livré IDE (ex. Embed) (**avant-dernier**)  
6. **Fin de maj** — **relecture docs** (1.5.21 + 1.5.22) (**dernier**)

## Cap

Système **auto-régulateur** : on n’adapte pas les capacités du moteur, on adapte **ce qu’on expose au modèle** (L1–L5). Sonde + historique prompts + console (scores, override, graphiques) + wrappers découplés — **après** CB3b.

**Abandonné** : tool calling « universel » tous providers.

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-CB3b-CATALOGUE.md](PLAN-CB3b-CATALOGUE.md) | Catalogue admin — **priorité #1** |
| [PLAN-MODEL-AUTO-REGULATION.md](PLAN-MODEL-AUTO-REGULATION.md) | Leviers L1–L5 · console · histo · roadmap R0–R11 — **#2** |
| [PLAN-SUBAGENTS-EXPLORE-IDE.md](PLAN-SUBAGENTS-EXPLORE-IDE.md) | Explore / `task` IDE (opt-in) — à arbitrer |
| [PLAN-SAV-CHAT-ERRORS.md](PLAN-SAV-CHAT-ERRORS.md) | SAV retry + capture erreurs chat — à arbitrer |
| [PLAN-PORT-FORWARDING.md](PLAN-PORT-FORWARDING.md) | Port forward VS Code → Drox — **avant-avant-dernier** |
| [PLAN-AGENTS-PARITY.md](PLAN-AGENTS-PARITY.md) | Parité Agents (Embed, etc.) — **avant-dernier** |

## Synthèse

| # | Sujet | Statut | Ordre |
|---|--------|--------|-------|
| **G** | CB3b catalogue admin | ✅ MVP + exclusions + rebuild | **1** |
| A–D | Auto-régulation (console · histo · L1–L5) | 🚧 **R0–R1 ✅** · R2+ | **2** |
| E | Explore IDE (`task` / subagents) | 📋 reporté | 3+ |
| F | SAV erreurs chat | 📋 reporté | 3+ |
| H | CB5 carte code (opt.) | 📋 reporté | 3+ |
| **PF** | Port forwarding (local / service user) | 📋 cadrage | **avant-avant-dernier** |
| **AG** | Parité Agents (Embed & co.) | 📋 cadrage | **avant-dernier** |
| **DOC** | Relecture / MAJ docs (**1.5.21 + 1.5.22**) | 📋 **dernière étape maj** | **fin** |

## Décisions clés

- **CB3b d’abord** : parcourir / supprimer / compacter l’index depuis le cockpit (store JSON actuel).
- Auto-régulation ensuite : package découplé · console sous Embed · Auto par levier · override manuel.
- Explore / SAV / CB5 : reportés, arbitrage après A–D.
- **Fin de maj (ordre)** : Port forwarding → Parité Agents (ex. Embed accessible depuis Agents) → pass docs.
