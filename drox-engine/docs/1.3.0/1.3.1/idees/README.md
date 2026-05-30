# Idées — backlog 1.3.1

Fiches **non engagées** : capture d’intention, pistes techniques, questions ouvertes.  
Statut par défaut : **idée brute** jusqu’à promotion en vision 1.3.1.

| # | Fiche | Résumé | Statut |
|---|--------|--------|--------|
| 01 | [Serveurs d’inférence par rôle](01-serveurs-inference-par-role.md) | Architecte et exécuteurs / sous-agents sur des **backends LLM distincts** (local + distant) | Idée |
| 02 | [Onglet parcours modèles](02-onglet-parcours-modeles.md) | Panneau type **Terminal** : visuel temps réel du parcours lecture/édition (mermaid + diffs) | Idée |
| 03 | [Preview web & outils navigateur](03-preview-web-outils-navigateur.md) | Onglet IDE sur l’app web : navigation, DOM, devtools pour le modèle | Idée |
| 04 | [Mode long-run](04-mode-long-run.md) | Tâches très complexes sur **plusieurs heures**, plan à centaines d’étapes | Idée |
| 05 | [Stats perf par cycle](05-stats-perf-par-cycle.md) | KPI par cycle : lignes modifiées, tokens par rôle/sous-agent, outils, durée | Idée |

---

## Comment ajouter une idée

1. Créer `NN-titre-court.md` (numéro suivant).  
2. Reprendre le gabarit des fiches existantes (résumé, problème, vision, pistes, liens, questions).  
3. Mettre à jour ce tableau.

---

## Critères de promotion (idée → chantier)

- Dogfooding ou retour utilisateur qui **justifie** l’effort.  
- Faisabilité moteur + IDE estimée (pas de blocage ADR majeur).  
- Périmètre MVP défini (une plateforme, un cas d’usage).  
- Tests de non-régression identifiés (régression orchestration, VRAM, UI chat).
