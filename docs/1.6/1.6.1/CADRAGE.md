# Cadrage 1.6.1 — accompagner un petit modèle sans forker le moteur

**Parent** : [README](README.md) · freeze [1.6.0 CLOSURE](../1.6.0/CLOSURE-1.6.0.md)  
**Règle** : [pas-d-initiative](../../../.cursor/rules/pas-d-initiative.mdc) — proposer, coder seulement lots validés.

## 1. Intention produit

Reproduire un agent **autonome dans l’IDE** (gros projets), **y compris avec de petits modèles**. Un 9B **sait** beaucoup ; il a moins d’**attention** et moins de **fidélité d’appel**. Le moteur **porte le rituel** ; le modèle porte le contenu.

| Barre | Modèle | Succès |
|-------|--------|--------|
| Canari | `ornith-1.5:9b` | Gros run **termine** (writes + Stop), quitte à être **sale** |
| Qualité | Qwen 3.8 ~27B | Même contrat, rendu plus propre |
| Plein protocole | Cloud / gros | Preset qui **garde** CORE dense, gates, micro-cycles, Explore kinds |

**Pas** : changer de paradigme, ni « petit run hello-world » comme cap produit.  
**Pas** : couper le CORE pour tout le monde.

## 2. Presets vs onglet

| Couche | Rôle |
|--------|------|
| **2–4 presets** | C’est le produit (`local-9b` / `local-27b` / `cloud-full` — noms à figer) |
| **Onglet détail** | Power user + dogfood interne ; chaque knob mappe un preset |
| Interdit | 40 settings orphelins sans preset par défaut |

Un preset **9B n’enlève pas** Explore / phases / todo : il **assouplit ou synthétise** (moteur complète un marqueur manquant, moins de MustText simultanés, moins de tools exposés si besoin). Le preset cloud **reste** la sur-spécification actuelle.

## 3. Seaux (à inventaireer ensuite, pas à coder ici)

### Toujours vrai (tous profils) — pas des knobs « confort »

- Tools / bash / Explore merge : **pas de mensonge** (stdout, spill, host kill) — reprise P0 bash si encore vide.
- Compaction **persistée** (JSONL).
- Loop detect **sans reset** ; clôture **Stop** (ForceConclude / SyntheticDone), pas abort opaque comme seul chemin.
- Pas de RAG vectoriel du transcript.

Un preset ne « corrige » pas un `stdout: ""`.

### Knobs de profil (candidats — liste ouverte)

À trancher lot par lot :

- Volume **CORE** / supplements session (what is always-on).
- **Gates dures** : todo-avant-mutate, testing-avant-done, answering-avant-done, micro-cycle 4 phases / edit.
- **Explore** : on/off, kickoff soft, kinds, covered / stall-act.
- **Tools exposés** (surface schéma).
- **Prefer / nudges** runtime (seuil, réinjection).
- Anti-loop : seuils warn / ForceConclude.

### Hors 1.6.1 immédiat (report 1.6.0)

P2 wrap bash, `GIT_PAGER`, D6 orphan, OBS export, `rewrite_plan` — seulement s’ils **bloquent** le canari 9B.

## 4. Ordre de travail proposé (pas encore validé comme lots)

1. Inventaire **tour 0** : tokens CORE + tools + frames pour Ornith.  
2. Figer **noms + défauts** des presets (table knobs).  
3. Câbler config moteur (`AgentConfig` / settings `drox.*`) **sans** UI si plus simple en premier lot.  
4. Onglet settings + presets.  
5. Dogfood Ornith (autonomie sale) puis Qwen 27B.

## 5. Git (quitter 1.6.0)

1. Committer le snapshot freeze **sur `1.6.0`** (working tree actuel = lots 1.6.0, pas encore sur origin).  
2. `git checkout -b 1.6.1` **depuis** ce commit — **pas** depuis `main`.  
3. Bump `droxVersion` → `1.6.1`.  
4. **Aucun** merge vers `main` avant produit stable. Cible : `1.6.1` si git propre ; sinon `1.6.2` (squash / read-tree).

## 6. Une phrase

**Même moteur, politique par profil.** Le 9B valide que l’accompagnement tient ; le cloud garde le protocole entier.
