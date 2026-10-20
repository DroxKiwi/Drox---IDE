# Ligne de version 1.6

**Prérequis** : [1.5.23](../1.5/1.5.23/README.md) tag `v1.5.23` (hotfix inclus) · ligne 1.5 **clôturée**

---

## Statut actuel

| Dossier | Périmètre | Statut |
|---------|-----------|--------|
| [**1.6.0/**](1.6.0/README.md) | Boucles · compaction · Vague 4 · prompts / Explore · contrats · bash capture | **Freeze** ([CLOSURE](1.6.0/CLOSURE-1.6.0.md)) · pas ship |
| [**1.6.1/**](1.6.1/README.md) | Profils moteur · presets · canari 9B / qualité 27B | **Ouvert** (cadrage) |

---

## Git — ne pas polluer `main`

`main` = dernier **produit stable shippé** (aujourd’hui `v1.5.23`). La ligne 1.6 **ne merge pas** tant qu’un `1.6.x` n’est pas un produit stable.

| Branche | Rôle |
|---------|------|
| `main` | Ship. **Pas** de merge `1.6.0`. |
| `1.6.0` | Freeze historique. On **quitte** ; on **ne merge pas** vers `main`. |
| `1.6.1` | Travail profils. Si l’historique est **propre** (peu de commits de chantier, message clair) → PR/merge `main` + tag. |
| `1.6.2` | **Filet git** : si `1.6.1` est trop bruitée, ouvrir depuis `1.6.1` et merger **ça** vers `main` (squash / read-tree [01-BRANCHE](../operations/01-BRANCHE.md) §4 B) pour une prod lisible. |

Ouvrir `1.6.1` depuis `main` **perdrait** le freeze. Toujours **depuis** `1.6.0` (snapshot commité), puis bump `droxVersion`.

Process générique : [01-BRANCHE](../operations/01-BRANCHE.md) — **sauf** le `checkout -b` depuis `main` tant que 1.6 n’est pas sur `main`.

## Cap de la ligne

Fiabiliser le **drive agent** (fin de run, anti-boucle, compaction durable, jauge tokens, curation du prompt) sans changer le paradigme produit (phases, tools, mémoire).  
Les modèles locaux / flash restent supportés : c’est l’**orchestration** qui doit borner les attracteurs de boucle et alléger la fenêtre (situation card, snip chaud — **pas** de RAG vectoriel du transcript).

---

## Liens

- [Hub 1.5](../1.5/README.md)
- [Opérations release](../operations/README.md)
- [Engine (réf. runtime)](../engine/README.md)
- [1.6.0 PLAN contexte sérieux](1.6.0/PLAN-CONTEXT-SITUATION.md)
- [1.6.1 cadrage profils](1.6.1/CADRAGE.md)
