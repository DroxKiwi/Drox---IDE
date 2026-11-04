# 1.6.5 — Objectifs

**Statut** : ouvert. Cadrage, pas de lot de code tant que ce n’est pas validé.  
**Précédent** : [1.6.4](../../1.6.4/README.md).

Les profils moteur restent `cloud-full` (full protocol), `local-27b` et `local-9b` (local capable).

---

## O1 — Différencier le full protocol du local capable

Le full protocol et le local capable se ferment aujourd’hui de la même façon : un tour sans outil arrête le run parent. Le texte du full protocol demande encore `[phase: done]`, sans que le moteur en tire un comportement à part.

Il faut une différence réelle, et une plus-value du mode full protocol.

## O2 — Continuer sur la stabilité des runs

La 1.6.4 a retiré l’exigence de phase testing avant la clôture. Ce chantier reste ouvert : un run doit se terminer de façon stable.

Point déjà noté, pas repris dans cette ouverture : [conclusion répétée](../../1.6.4/MAJ/RAPPORT-CONCLUSION-REPETEE.md).
