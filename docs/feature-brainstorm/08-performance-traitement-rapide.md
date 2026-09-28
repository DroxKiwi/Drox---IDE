# Idée 08 — Performance : accélérer fortement les traitements

**Statut** : idée ouverte (pistes à affiner) — cible **post-1.3.1**  
**Date** : 2026-06-02  
**Priorité** : haute produit (latence globale)

---

## Résumé

Les runs corrects mais **lents** (lectures, replays, contexte LLM, tours multiples) freinent l’usage quotidien. Il faut une stratégie pour rendre les traitements **beaucoup plus rapides** — sans casser la fidélité sur les vraies tâches de code.

**Piste centrale (à affiner)** : **tronquer volontairement** certaines parties (sorties outils, historique, rapports exécuteur) tout en gardant ce qui décide la suite du run.

---

## Problème actuel

| Zone | Effet latence |
|------|----------------|
| Rejeu session / UI replay | Tout charger d’un bloc (voir idée 06) |
| `tool_result` dans le contexte | Fichiers entiers, logs bash, JSON verbeux |
| Rapports `delegate_executor` | Markdown long même quand l’architecte n’a besoin que d’un résumé |
| Tours architecte | Re-lectures / re-plans après micro-échecs |
| Modèle / réseau | `num_ctx` élevé, modèles lourds sur chaque rôle |

---

## Axes à explorer (non exclusifs)

### A — Troncature intelligente (volontaire)

- Plafond tokens par `tool_result` (déjà partiel via snip / compaction — **renforcer**).
- Tronquer **tête + queue** des gros fichiers lus (garder signatures / erreurs).
- Rapport exécuteur : **résumé structuré** obligatoire (N lignes max) avant injection transcript parent.
- Sorties `grep` / `glob` : top-K chemins, pas liste exhaustive.

### B — Moins de travail inutile

- Idée 07 : pas de plan/délégation pour questions légères.
- Éviter re-délégations quand le delta est trivial.
- Parallélisme exécuteur déjà en 1.3 — pousser scopes plus gros **quand** sûr.

### C — Contexte / modèle

- Modèles plus petits pour exécuteur ou pour passes « lecture seule ».
- Compaction proactive plus agressive sous seuil (déjà `context_compacted` — tuning).
- Cache workspace map / index fichier (moins de `file_read` répétés).

### D — Côté IDE

- Chargement session segmenté (idée 06).
- UI : ne pas bloquer le renderer sur replay massif.

---

## Questions ouvertes

| # | Question |
|---|----------|
| Q1 | Quels outils tronquer en premier (bash, grep, file_read) ? |
| Q2 | Seuil fixe (tokens) vs adaptatif (modèle / tâche) ? |
| Q3 | Risque de perte d’info : comment signaler « contenu tronqué » à l’architecte ? |
| Q4 | Benchmark : même tâche avant/après (durée wall-clock, tokens, succès) ? |

---

## Critères d’acceptation (cible vague — à préciser en chantier)

- [ ] Benchmark documenté : au moins **−30 %** temps médian sur 3 scénarios dogfooding (à définir).
- [ ] Aucune régression critique sur tests réels [CRITERES-TEST-REEL.md](../1.3/1.3.0/finalisation/CRITERES-TEST-REEL.md).
- [ ] Troncatures **visibles** dans le fil (badge ou ligne système) pour debug.

---

## Liens

- [06-chargement-sessions-segmente.md](./06-chargement-sessions-segmente.md) — perf ouverture session
- [07-reponses-legere-sans-plan.md](./07-reponses-legere-sans-plan.md) — moins de cycles inutiles
- [MEMOIRE-LONG-TERME.md](../architecture/MEMOIRE-LONG-TERME.md) — budget tokens
- [PARALLELISME-DESIGN.md](../1.3/1.3.0/steps/03-parallelisme/PARALLELISME-DESIGN.md)
