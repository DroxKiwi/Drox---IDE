# 1.5.22 — Shell de discussion partagé Agents ↔ IDE

**Statut** : **préparé** · après tool calling 1.5.21  
**Version cible** : `droxVersion` **1.5.22**  
**Précédent** : [1.5.21](../1.5.21/README.md) — tool calling universel  
**Suite** : [1.5.23](../1.5.23/README.md) — index `@Codebase` + carte code

## Docs

| Fiche | Sujet |
|-------|--------|
| [PLAN-SHARED-DISCUSSION-SHELL.md](PLAN-SHARED-DISCUSSION-SHELL.md) | **Plan principal** — shell Agents + **tous** ses outils de discussion dans l’IDE |

## Synthèse

| # | Sujet | Statut |
|---|--------|--------|
| S0 | Inventaire shell + outils (modèle, connexion, params, modes, status) | ✅ |
| S1 | Module options/CSS discussion partageable | ✅ |
| S2 | Brancher panneau IDE + masquer chrome Copilot | ✅ |
| S3 | Parité interactive de chaque contrôle | 🔄 |
| S4 | Handoff + empty-first sur le nouveau shell | 🔄 |
| S5 | Smoke Agents + IDE + CLOSURE | 📋 |

## Décisions clés

- **Parité stricte** de la zone discussion Agents ↔ IDE, **y compris** choix modèle, connexion/serveur, paramètres modèle, modes, status bar, toolbar.
- On **extrait** le shell Agents déjà adapté ; on ne réécrit pas une 3ᵉ UI.
- L’IDE **n’embarque pas** le chrome fenêtre (liste sessions, Customizations, Changes latéral Agents).
- History / Changes IDE restent les ports 1.5.20 à côté du shell.
- Cerveau inchangé : `DroxAgentsSessionHandler` + `drox.exe`.

## Origine

1.5.11 = ChatWidget Copilot côté IDE. Demande produit : même discussion qu’Agents **avec l’intégralité des outils**. Reporté en **1.5.22** pour laisser **1.5.21** au tool calling universel.
