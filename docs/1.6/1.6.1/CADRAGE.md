# Cadrage 1.6.1 — sous-run par défaut, presets comme véhicule

**Parent** : [README](README.md) · freeze [1.6.0 CLOSURE](../1.6.0/CLOSURE-1.6.0.md)  
**Règle** : [pas-d-initiative](../../../.cursor/rules/pas-d-initiative.mdc) — proposer, coder seulement lots validés.

## 1. Phrase produit (figée)

**Même paradigme, mais le sous-run est le chemin par défaut des grands chantiers, porté par le moteur + un preset — pas un mode expert.** Les presets sont le **véhicule**, pas le but.

1.6.0 a posé Explore (child à contexte étroit). C’est la bonne thèse pour un petit modèle (attention / fidélité d’appel). Ça a été **fastidieux** parce que le **parent** devait encore jouer l’orchestrateur (Plan → Assign → kinds → merge → ne pas relire). Le child voyait juste ; le 9B parent se noyait dans le protocole.

## 2. Intention

Reproduire un agent **autonome dans l’IDE** (gros projets), **y compris avec de petits modèles**. Un 9B **sait** beaucoup ; il a moins d’**attention** et moins de **précision d’appel**.

| Qui | Rôle |
|-----|------|
| **Child / sous-run** | Objectif étroit, tools, livrable court (c’est là que le petit modèle **code**). |
| **Moteur** | Découpe, assigne, fusionne, situation, clôture — **porte le rituel**. |
| **Parent** | Colle les livrables et enchaîne ; **pas** un chef d’orchestre en prose CORE. |
| **Preset cloud** | Garde le protocole manuel 1.6.0 (kinds, micro-cycles, CORE dense) pour les gros modèles. |

| Barre | Modèle | Succès |
|-------|--------|--------|
| Canari | `ornith-1.5:9b` | Gros chantier **termine** via sous-runs (writes + Stop), quitte à être **sale** |
| Qualité | Qwen 3.8 ~27B | Même contrat, rendu plus propre |
| Plein protocole | Cloud / gros | Preset qui **garde** CORE dense, gates, Explore kinds « à la main » |

**Pas** : changer de paradigme (phases, tools, MEMORY, Explore restent).  
**Pas** : « petit run hello-world » comme cap produit.  
**Pas** : couper le CORE pour tout le monde.  
**Pas** : faire du preset un produit à 40 cases.

## 3. Presets vs onglet (véhicule)

| Couche | Rôle |
|--------|------|
| **3 presets** | `local-9b` · `local-27b` · `cloud-full` — **pas** de 4ᵉ `local-strict` au début |
| **Onglet détail** | Power user ; chaque knob mappe un preset |
| Interdit | 40 settings orphelins ; preset 9B qui **éteint** Explore |

Le 27B **interpole** 9B ↔ cloud (on fige d’abord les deux extrêmes).  
**Défaut produit** : **`local-9b`** (plus petit modèle / canari Ornith) — figé 2026-10-20.

## 3ter. Admin UI — noms (draft)

Pas de 4ᵉ profil « Custom » au v1. Un **seul** sélecteur ; l’onglet détail vient **après**.

**Setting** : `drox.engine.profile` · enum `local-9b` | `local-27b` | `cloud-full` · default `local-9b`.  
**Où** : **Model settings** (à côté du picker modèle) + page Settings **Drox → Agent / Engine**. Pas un panneau séparé « admin » au v1.

| Id (git / config) | Libellé UI (EN, `localize`) | Sous-titre (une ligne) |
|-------------------|-----------------------------|-------------------------|
| `local-9b` | **Small model** | Engine runs sub-agents; light parent protocol. Default. |
| `local-27b` | **Local capable** | Same sub-runs; parent a bit more tools and gates. |
| `cloud-full` | **Full protocol** | 1.6.0 manual Plan→Assign, full CORE and tools. |

FR (si on expose une locale) : **Petit modèle** · **Local capable** · **Protocole complet**.  
On **n’écrit pas** « 9B / 27B » dans le libellé principal (ça lie l’UI à une taille de poids). Les ids techniques restent `local-9b` / `local-27b`.

Knobs avancés (CORE, tools parent, gates) : **pliés** sous le sélecteur, chacun bound au preset ; changer un knob ne crée pas un 4ᵉ profil au v1 (revient au preset ou « overrides » plus tard — hors scope).

## 3bis. Table knobs × presets (figée 2026-10-20)

Photo tour 0 : [INVENTAIRE-TOUR-0](INVENTAIRE-TOUR-0.md). Le child est déjà cheap ; les knobs **allègent le parent**.

| Knob | `local-9b` (Ornith) | `local-27b` (Qwen) | `cloud-full` |
|------|---------------------|--------------------|--------------|
| **Sous-run** | Chemin **défaut** work multi-fichier ; **moteur** kickoff / merge | Idem, parent un peu plus libre | Comme 1.6.0 : parent **déclare** Plan→Assign |
| Supplement Explore + roman `task` | Court / pointeur | Court | **Plein** (~704 + ~443 tok) |
| CORE parent | **Allégé** (phases utiles, pas micro-cycle / MEMORY / worktrees always-on) | Intermediate | **CORE actuel** (~6,3k) |
| Tools **parent** | Court : todo, edit, bash, needle read, `task` | + lsp / web / ask | **37** schemas |
| Tools **child** | Inchangé (étroit) | Inchangé | Inchangé |
| Gates dures parent | Peu (mutation dangereuse) ; `done` synthétisable | Todo + testing souples | **Toutes** (todo, testing, answering, micro-cycle) |
| Prefer / nudges | Peu, moteur d’abord | Moyen | Empile 1.6.0 |
| Canari succès | Gros run **termine**, même sale | Plus propre | Protocole entier |

Knob Explore = **qui porte l’orchestration**, pas on/off.

**Hors table** (tous profils) : vérité tools/bash, compaction JSONL, loop sans reset, Stop propre, pas de RAG transcript. Host `params.system` : **pas** un knob tant que non mesuré.

Un preset ne « corrige » pas un `stdout: ""`.

### Hors 1.6.1 immédiat (report 1.6.0)

P2 wrap bash, `GIT_PAGER`, D6, OBS, `rewrite_plan` — seulement s’ils **bloquent** le canari.

## 4. Ordre de travail

1. Inventaire tour 0 — ✅ [INVENTAIRE-TOUR-0](INVENTAIRE-TOUR-0.md).  
2. Noms + table knobs — ✅ §3bis.  
3. Défaut produit — ✅ `local-9b`. Libellés UI — 📐 §3ter (à valider).  
4. Câbler `AgentConfig` / `drox.engine.profile` **sans** knobs avancés si plus simple (lots à valider).  
5. Sélecteur Model settings + Settings Drox.  
6. Dogfood Ornith puis Qwen 27B.

## 5. Git

Branche `1.6.1` **depuis** freeze `1.6.0`. **Pas** de merge `main` avant produit stable. Cible : `1.6.1` si git propre ; sinon `1.6.2` (squash / read-tree).
