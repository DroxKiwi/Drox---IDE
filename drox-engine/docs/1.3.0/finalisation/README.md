# Drox 1.3.0 — Finalisation & distribution

**Statut** : cadrage (à détailler en fin de cycle 1.3.0)  
**Date** : 2026-05-27

---

## Contexte

| Phase | Objectif |
|-------|----------|
| **Maintenant** | Test réel sur un projet entier (ex. site vitrine Nexus) — valider que l’IDE **tient la route au-delà de 15 minutes** (sessions longues, reprise, orchestration, UI). |
| **Fin 1.3.0** | Livrer une **distribution installable** pour utilisateurs finaux, sans exposer le dépôt source complet. |

---

## Documents

| Document | Contenu |
|----------|---------|
| [PLAN-DISTRIBUTION-LAUNCHER.md](./PLAN-DISTRIBUTION-LAUNCHER.md) | **Plan d’implémentation** — build packagé, installeur, MAJ hybride, releases |
| [PATCHES-UPSTREAM-BUILD.md](./PATCHES-UPSTREAM-BUILD.md) | **Patches build** — à réappliquer après merge VS Code |
| [FINALISATION-DISTRIBUTION.md](./FINALISATION-DISTRIBUTION.md) | Cadrage produit (vision, composants, décisions) |
| [CRITERES-TEST-REEL.md](./CRITERES-TEST-REEL.md) | Grille de validation « projet entier / session longue » |
| [MISE-A-JOUR-ARCHITECTE-TODO.md](./MISE-A-JOUR-ARCHITECTE-TODO.md) | Correctifs 1.3.0 sur la clôture `todo_write` et anti-boucle Architecte |

---

## Livrables cibles (rappel)

1. **Exécutable d’installation** — setup Windows (puis macOS/Linux si pertinent).
2. **Launcher** — démarrage de l’IDE + canal de **mises à jour** (notification « une nouvelle version est disponible »).
3. **Dépôt / canal de production** — binaires + manifests ; **pas** de clone du monorepo pour le téléchargement gratuit grand public.

**Marque produit (2026-05-28)** : **Drox IDE** (éditeur) + moteur **Drox** — voir `product.json`.

---

## Lien avec le reste de 1.3.0

Le cœur 1.3.0 reste le **parallélisme exécuteurs** et la robustesse UI (voir [README.md](../README.md)).  
La finalisation distribution est un **lot distinct** en fin de version : ne pas bloquer P4a–c, mais ne pas le repousser indéfiniment après validation terrain.
