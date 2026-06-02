# Feature brainstorm — backlog produit & moteur

Fiches **non engagées** : capture d’intention, pistes techniques, questions ouvertes.  
Hors périmètre des releases versionnées (`drox-engine/docs/1.3/…`) — ne bloque pas [CLOSURE-1.3.1](../1.3/1.3.1/finalisation/CLOSURE-1.3.1.md).

Statut par défaut : **idée brute** jusqu’à promotion en chantier (`drox-engine/docs/1.3.x/steps/` ou plan dédié).

| # | Fiche | Résumé | Statut |
|---|--------|--------|--------|
| 01 | [Serveurs d’inférence par rôle](01-serveurs-inference-par-role.md) | Architecte et exécuteurs / sous-agents sur des **backends LLM distincts** (local + distant) | Idée |
| 02 | [Onglet parcours modèles](02-onglet-parcours-modeles.md) | Panneau type **Terminal** : visuel temps réel du parcours lecture/édition (mermaid + diffs) | Idée |
| 03 | [Preview web & outils navigateur](03-preview-web-outils-navigateur.md) | Onglet IDE sur l’app web : navigation, DOM, devtools pour le modèle | Idée |
| 04 | [Mode long-run](04-mode-long-run.md) | Tâches très complexes sur **plusieurs heures**, plan à centaines d’étapes | Idée |
| 05 | [Stats perf par cycle](05-stats-perf-par-cycle.md) | KPI par cycle : lignes modifiées, tokens par rôle/sous-agent, outils, durée | Idée |
| 06 | [Chargement sessions segmenté](06-chargement-sessions-segmente.md) | Reprise historique OK mais lente — afficher **la fin** d’abord, puis le reste | **Priorité post-1.3.1** |
| 07 | [Réponses légères sans plan](07-reponses-legere-sans-plan.md) | Salut / avis rapide — pas de plan ni délégation si inutile | **Priorité post-1.3.1** |
| 08 | [Performance traitement rapide](08-performance-traitement-rapide.md) | Accélérer fortement les runs — troncature, moins de travail, tuning | **Priorité post-1.3.1** (pistes ouvertes) |

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

---

## Liens

- [Suivi release 1.3.1](../1.3/1.3.1/finalisation/CLOSURE-1.3.1.md)
- [Ligne 1.3 — hub](../1.3/README.md)
- [1.3.0 — moteur livré](../1.3/1.3.0/README.md)
- [Hub doc moteur](../README.md)
- [RULES.md](../../../../RULES.md) — conventions repo
