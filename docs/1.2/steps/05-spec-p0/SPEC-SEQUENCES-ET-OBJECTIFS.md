# SPEC — séquences et objectifs

**Version** : 1.2.0  
**Statut** : **brouillon P0** — à compléter avant P3-4  
**Parent** : [PLAN-IMPLEMENTATION-1.2.0.md](../04-implementation/PLAN-IMPLEMENTATION-1.2.0.md) · P0-2 · [VISION §2.2](../01-vision/VISION-ORCHESTRATION-MULTI-ROLES.md)

---

## 1. Définitions

| Terme | Définition |
|-------|------------|
| **Séquence** | Lot d’objectifs confiés par l’Architecte à un niveau aval (chef ou exécutants) |
| **Objectif** | Unité de travail atomique côté planification ; devient un ou plusieurs `RunUnit` |

---

## 2. Schéma `Sequence` (provisoire)

| Champ | Type | Obligatoire |
|-------|------|-------------|
| `sequence_id` | string (UUID) | oui |
| `title` | string | oui |
| `objectives` | `Objective[]` | oui |
| `assigned_conductor` | optionnel P4 | non (P3 : exécutants directs) |
| `status` | enum | oui |

### Statuts séquence

`pending` → `running` → `completed` | `failed` | `cancelled`

---

## 3. Schéma `Objective`

| Champ | Type | Notes |
|-------|------|-------|
| `objective_id` | string | |
| `description` | string | Prompt délégué |
| `scope` | `{ paths?, globs? }` | Périmètre fichiers |
| `depends_on` | `objective_id[]` | P4 — graphe |
| `status` | enum | |
| `deliverable` | string | Ce que le parent attend en synthèse |

---

## 4. Règles (vision)

1. L’Architecte **compose** ≥1 séquence ; il ne mute pas le repo en première intention.
2. P3 : séquences **linéaires** (pas de `depends_on` parallèle).
3. P4 : `depends_on` + groupes parallèles dans `RunPlan.parallel_groups`.
4. Un objectif échoué : politique **à figer** (re-plan architecte vs retry chef).

---

## 5. À compléter (checklist P0-2)

- [ ] Format persistance (session JSONL extension ?)
- [ ] Événements stream pour progression séquence
- [ ] Idempotence relance objectif
