# Vision 1.2.0 — Orchestration multi-rôles et multi-modèles

**Version** : 1.2.0  
**Date** : 2026-05-20  
**Statut** : vision produit / architecture (document fondateur)  
**Héritage** : remplace l’axe « profils Low / Medium » décrit dans `docs/0.0.0` (archivé).

---

## 1. Changement de paradigme

### 1.1 Ce que nous quittons (0.0.0)

L’approche **0.0.0** visait à stabiliser **deux profils d’exécution** (Low / Medium) sur **un même agent** : mêmes outils en gros, mais prompts, gates, `max_iterations` et sous-agents explore adaptés à la taille du modèle choisi par l’utilisateur.

**Limite constatée** : ce n’est pas la bonne structure pour obtenir de façon fiable :

> **Décomposition de tâches complexes** par **identification** et **séparation des responsabilités d’exécution** d’un plan via **plusieurs modèles**.

Un seul agent — même affaibli ou renforcé par profil — reste chargé de comprendre, planifier, explorer et muter dans une même boucle.

### 1.2 Ce que nous visons (1.2.0)

**Un seul profil d’exécution côté produit**, mais **plusieurs rôles** remplis par **des modèles de tailles différentes**, organisés en **pyramide de délégation** :

| Principe | Description |
|----------|-------------|
| **Spécialisation par rôle** | Chaque niveau a une responsabilité claire (concevoir / orchestrer / exécuter), pas un « mode Low » global. |
| **Taille du modèle ∝ profondeur de décision** | Plus la décision est stratégique ou structurante, plus le modèle est gros ; plus l’action est locale et répétitive, plus le modèle est petit. |
| **Plan ≠ exécution** | Le niveau supérieur découpe et confie ; il n’est pas censé faire tout le travail opérationnel. |
| **Récursion contrôlée** | Même schéma à chaque étage : découpe → délégation → exécution, jusqu’aux feuilles. |

---

## 2. Acteurs et responsabilités

### 2.1 L’Architecte (sommet)

**Modèle typique** : le plus gros disponible (ex. `qwen3.6:27b`).

**Entrée** : le message utilisateur (demande initiale).

**Mission** :

- Comprendre l’**objectif** et le contexte de la demande.
- Décider si un **plan** structuré est pertinent (tâche simple → chemin direct ; tâche complexe → découpage).
- **Ne pas** être le principal exécutant du dépôt : il *peut* agir sur le workspace, mais ce n’est **pas** son but précis.
- Piloter le travail **tâche par tâche** via l’outil **`delegate_executor`** (voir implémentation P3), puis **vérifier** avant la tâche suivante — qualité avant vitesse.

**Outils attendus (vision)** : **`delegate_executor`** pour lancer un run exécutant synchrone par tâche, plus lecture / cartographie — pas l’arsenal complet de mutation réservé aux feuilles.

### 2.2 Les Séquences

Une **séquence** est une **unité de travail déléguée** : un ensemble cohérent d’**objectifs** à exécuter par des modèles plus légers, avec un périmètre et un livrable attendu.

- L’Architecte **compose** une ou plusieurs séquences à partir du plan.
- Une séquence n’est pas « un seul appel outil » : c’est un **lot d’objectifs** orchestrés en aval.
- Le détail du format (JSON, RPC, file d’attente) sera spécifié dans des documents techniques ultérieurs.

### 2.3 Chef d’orchestre (niveaux intermédiaires)

À chaque **sous-arbre**, un modèle **intermédiaire** reçoit une **sous-tâche** (ou un objectif de séquence) confié par le niveau supérieur.

**Mission** :

- Traiter la sous-tâche comme un **mini-projet** : la comprendre, éventuellement la **re-découper**.
- Se comporter à son tour comme **chef** : déléguer des **sous-sous-tâches** à des exécutants encore plus légers, ou à un chef de niveau inférieur si la complexité le justifie.
- Synthétiser les retours pour le niveau parent (rapport structuré, pas dump brut du contexte enfant).

**Modèle typique** : plus petit que l’Architecte, plus gros que les exécutants du même branchement (ex. 9b–14b selon la machine).

### 2.4 Exécutant (feuilles)

**Modèle typique** : le plus petit du branchement (ex. 2b–7b).

**Mission** :

- Réaliser une **sous-sous-tâche** bornée : lecture ciblée, recherche, patch local, commande isolée, etc.
- Rester dans un périmètre **étroit** (fichiers, dossiers, objectif explicite).
- Remonter un **résultat structuré** au chef direct — pas re-planifier tout le projet utilisateur.

---

## 3. Arborescence de délégation

```text
Utilisateur
    │
    ▼
┌─────────────────┐
│   ARCHITECTE    │  gros modèle — objectif, plan, lancement de séquences
└────────┬────────┘
         │ séquence(s) : objectifs A, B, C…
         ▼
┌─────────────────┐
│ Chef (niveau 1) │  modèle intermédiaire — sous-tâche A
└────────┬────────┘
         ├──► Exécutants (feuilles sur A)
         │
         └──► Chef (niveau 2) — sous-sous-tâche A.1
                    └──► Exécutants (feuilles sur A.1)
```

**Règle récursive** : tout niveau « chef » peut reproduire le même motif (découpe → délégation → synthèse) tant que la tâche reste trop large pour un exécutant seul.

**Règle de taille** : à chaque descente, le modèle assigné est **plus léger** que celui du niveau parent (meilleur rapport coût / latence / VRAM sur les actions fines).

---

## 4. Objectif produit

Obtenir de manière **systématique** :

1. **Identification** des responsabilités (qui planifie, qui coordonne, qui exécute).
2. **Séparation** des contextes : le gros modèle ne noie pas son contexte dans des centaines d’appels outils bas niveau.
3. **Parallélisation** là où les objectifs sont **disjoints** (plusieurs séquences ou plusieurs branches d’exécutants).
4. **Qualité** sur les tâches complexes : le raisonnement lourd reste en haut ; l’exécution répétitive en bas.

Ce n’est plus « un agent avec un profil Low ou Medium », c’est un **système d’orchestration** dont l’interface utilisateur peut rester **une seule conversation**, mais dont le moteur fait tourner **plusieurs rôles et plusieurs modèles** en coulisse.

---

## 5. Rapport avec l’existant (0.0.0)

| Élément 0.0.0 | Évolution 1.2.0 |
|---------------|-----------------|
| `modelTier` Low / Medium | **Déprécié** comme axe principal ; remplacé par **rôle + modèle assigné au rôle** |
| Sous-agent `task` explore async | **Préfiguration** d’exécutants ; à généraliser en **séquences** et hiérarchie complète |
| `RunPolicy`, gates, phases `[phase: …]` | À **repenser** par rôle (l’Architecte ne suit pas le même protocole qu’un exécutant) |
| `nexus.drox.subagents.*` | Devient une brique d’une config **multi-rôles** plus large |
| Parallélisme Ollama (`NUM_PARALLEL`, tags) | Reste pertinent : **un tag par taille de modèle**, slots parallèles pour **plusieurs exécutants** sur le même petit modèle |

La doc technique détaillée (RPC, crates Rust, UI chat) est répartie sous `docs/1.2.0/steps/` (dossiers numérotés).

---

## 6. Hors périmètre de ce document (à préciser ensuite)

Les points suivants sont **volontairement** laissés ouverts pour les prochains échanges :

- Profondeur maximale de l’arbre (nombre de niveaux chef / exécutant).
- Format canonique d’une **séquence** et d’un **objectif** (schéma, id, statut, dépendances).
- Liste exacte des **outils par rôle** (mutations réservées aux exécutants ? lecture seule pour l’Architecte ?).
- Politique de **synthèse** remontante (quand le parent reprend la main).
- Migration IDE (settings, composer, affichage « N rôles actifs » vs « N modèles Ollama »).
- Critères d’arrêt, échec partiel, re-planification par l’Architecte.

---

## 7. Documents liés

| Document | Rôle |
|----------|------|
| `docs/0.0.0/` | Archive vision et plans **pré-1.2.0** (profils, M5c, stabilisation Low) |
| [ARCHITECTURE-DECOUPLAGE-UPSTREAM.md](../03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md) | **Prérequis** — moteur / UI / fork, merges VS Code sans perte |
| [VISION-ORCHESTRATION-MULTI-ROLES.md](./VISION-ORCHESTRATION-MULTI-ROLES.md) | **Ce fichier** — vision fondateur 1.2.0 |
| [VISION-CONSOLIDEE-1.2.0.md](./VISION-CONSOLIDEE-1.2.0.md) | Vision active + retours terrain |
| [PLAN-CONSTRUCTION-MOTEUR-1.2.0.md](../02-construction/PLAN-CONSTRUCTION-MOTEUR-1.2.0.md) | **Couches A/B/C/D** — séparation exécution / flow / plateforme |
| **[PLAN-IMPLEMENTATION-1.2.0.md](../04-implementation/PLAN-IMPLEMENTATION-1.2.0.md)** | **Plan de pilotage** — jalons P0–P5, checklists, journal |
| [SPEC-INTERFACES-RUN.md](../05-spec-p0/SPEC-INTERFACES-RUN.md) · [SPEC-SEQUENCES](../05-spec-p0/SPEC-SEQUENCES-ET-OBJECTIFS.md) · [SPEC-OUTILS](../05-spec-p0/SPEC-OUTILS-PAR-ROLE.md) | Specs P0 |
| [PLAN-IDE-1.2.0.md](../10-ide/PLAN-IDE-1.2.0.md) | Piste IDE parallèle |

---

## 8. Synthèse en une phrase

**1.2.0** : un **Architecte** (gros modèle) comprend et découpe le travail en **séquences** ; chaque séquence est menée par des **chefs** (modèles intermédiaires) qui délèguent à des **exécutants** (petits modèles), avec la même logique récursive à chaque étage — **un profil produit, plusieurs rôles, plusieurs modèles**, au service de la décomposition de responsabilités et non de deux « modes » Low/Medium.
