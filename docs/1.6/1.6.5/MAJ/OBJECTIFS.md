# 1.6.5 — Objectifs

**Statut** : ouvert. Cadrage, pas de lot de code tant que ce n’est pas validé.  
**Précédent** : [1.6.4](../../1.6.4/README.md).

Les profils moteur restent `cloud-full` (full protocol), `local-27b` et `local-9b` (local capable).

---

## O1 — Différencier le full protocol du local capable

Le full protocol et le local capable se ferment aujourd’hui de la même façon : un tour sans outil arrête le run parent. Le texte du full protocol demande encore `[phase: done]`, sans que le moteur en tire un comportement à part.

Il faut une différence réelle, et une plus-value du mode full protocol.

Décision : le déroulement du run full protocol suit le local capable. Le catalogue d'outils ne change pas. La gate `todo_write` avant mutation est retirée. Le rapport Explore revient dans le tour, comme en local capable. Les reliquats de marqueurs de phase du parent full protocol sont retirés. Le mode professeur garde son CORE de phases.

## O2 — Continuer sur la stabilité des runs

La 1.6.4 a retiré l’exigence de phase testing avant la clôture. Ce chantier reste ouvert : un run doit se terminer de façon stable.

Point déjà noté, pas repris dans cette ouverture : [conclusion répétée](../../1.6.4/MAJ/RAPPORT-CONCLUSION-REPETEE.md).

## O3 — Requêtes concurrentes

Plusieurs sous-agents peuvent être déclarés dans le même tour. L’outil `Task` (Explore) est marqué concurrent.

Décision : small local et local capable exécutent les outils d’un tour l’un après l’autre. Le full protocol garde le lot parallèle. Le parent reçoit la consigne **Same message** : appels indépendants dans le même tour, un Explore par zone, mutation au tour suivant. Les rappels « plan d'abord, un seul Explore » ne partent pas sur ce parent.

## O4 — Cacher les mécaniques de dev en version live

La surface `release` ne doit pas montrer les outils de dogfood.

- **Arm debug capture** dans le chat (`drox.nativeChat.runCapture`, icône bug du titre). Le bouton n'est au menu que si `droxDevSurface` est vrai. L'action reste sans effet en `release`.
- **Consistency** dans le panneau SDTCM (phases, tours, Run consistency). Le bloc n'est pas rendu en `release`. L'export SDTCM était déjà masqué.
