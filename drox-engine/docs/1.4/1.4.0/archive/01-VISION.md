# 01 — Vision Run Rail

**Parent** : [README](README.md) · **Suite** : [02-RAIL-PROTOCOL.md](02-RAIL-PROTOCOL.md)

---

## Problème constaté (dogfood 1.3.4)

Session `chat.txt` (~349 steps, 45k ctx) : un modèle **puissant**, architecte **seul**, sans cadence :

- Proposition design → `todo_write` + mutations sans validation user.
- Boucles `file_write` / bash / scripts jetables.
- Gates de clôture actives, mais **aucune gate de progression**.
- Le moteur **réagit** (nudge, anti-boucle tardif) au lieu de **cadencer**.

Ce n’est pas un bug unique — c’est un **modèle de conduite** inadapté aux modèles forts.

---

## Ce qui avait de la valeur (tentatives passées)

| Idée fructueuse | Mauvaise implémentation |
|-----------------|-------------------------|
| Borner les intentions avant l’action | `GateEngine` arbre TOML, paliers `E-*` |
| Isoler le contexte par morceaux de run | Sub-agents configurables, UX lourde |
| Question à l’entrée (« quel chemin ? ») | Tour `architect_intent` unique, puis liberté totale |
| Plan = engagement | Plan optionnel sans effet moteur cohérent |

**Archive** : [gates/ARCHIVE.md](../../../1.3/1.3.2/gates/ARCHIVE.md) — ne pas recréer sans lire ce document.

---

## Principes directeurs (1.4)

### P1 — Rail linéaire, pas d’arbre

Une seule séquence canonique de stations. Pas de branche `si CSS alors …`. Voir [03-STATIONS.md](03-STATIONS.md).

### P2 — Gates consultatives à chaque frontière

À chaque passage de station, le modèle répond : **la prochaine gate est-elle logique, ou je coupe ici ?**

- Protocole : `[gate: hold]` | `[gate: advance]` (détail en [02](02-RAIL-PROTOCOL.md)).
- Ce n’est **pas** de l’« early exit » moteur — c’est l’**agency du modèle** sur la profondeur.

### P3 — Mode A : le moteur propose la candidate

**Décision figée** : après chaque `advance`, la candidate suivante est **toujours** le successeur linéaire (`INTENT` → `READ` → …).

**Mode B** (le modèle demande un saut de station avec justification) — **reporté**, documenté comme extension en [02](02-RAIL-PROTOCOL.md#mode-b-reporté).

### P4 — Plan non obligatoire sauf édition complexe

Chemin court autorisé : `INTENT → READ → ACT → VERIFY → ANSWER` sans `todo_write`.

`PLAN` + hold `PROPOSE` seulement si `depth: complex` (critères en [03](03-STATIONS.md#depth-short-vs-complex)).

### P5 — Délégation = segments internes

Un modèle, une instance. Segments = transcript frais + masque d’outils + brief étroit. L’utilisateur ne configure rien. Voir [04](04-SEGMENTS.md).

### P6 — UI : blocs repliables, info minimale

Un bloc par station **réellement empruntée**. Titre + compteur + statut. Voir [06](06-UI-BLOCKS.md).

### P7 — Code maintenable

Module `run_rail/` dédié, fichiers courts, commentaires en tête de module. **Pas** de logique rail éparpillée dans `loop.rs`. Voir [05](05-CODE-ARCHITECTURE.md).

---

## Périmètre 1.4.0 vs 1.3.4 vs 1.4.1

| Version | Périmètre |
|---------|-----------|
| **1.3.4** | Solo (clôturée anticipé) — base code conservée |
| **1.4.0** | Run rail + segments + UI blocs |
| **1.4.4** | Index RAG, ContextPack, graphe — **complémentaire** (injecté au boot READ) |

---

## Non-objectifs 1.4

- Rebrancher `GateEngine` / TOML / backpack.
- Réexposer `delegate_executor` comme outil utilisateur.
- Validation user systématique avant tout plan.
- Heuristique « salut » qui remplace le jugement du modèle (heuristique actuelle = **défaut boot** seulement).

---

## Critère de succès produit

| Scénario | Comportement attendu |
|----------|---------------------|
| « Salut » | `hold` à INTENT ou READ → ANSWER, pas de `todo_write` |
| « Lis le repo » | READ → synthèse → `hold` → ANSWER |
| « Charte CSS complexe » | READ → PROPOSE → (hold si complex) → PLAN → ACT segmenté → VERIFY → ANSWER |
| Échec `file_write` ×2 | Circuit breaker station ACT, message user, pas 300 steps |

Dogfood : rejouer les 3 messages de `chat.txt` avec un run < 80 steps et livrable valide.
