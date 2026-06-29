# Drox 1.5.10 — Run recovery & respawn moteur

**Statut** : **livré** (`v1.5.10`)  
**Prérequis** : [1.5.9](../1.5.9/README.md) livrée (`v1.5.9`)

---

## En une phrase

Rendre **Reprendre** / **Recommencer** toujours disponibles sur le message utilisateur du run courant (reset « urgence » via **Recommencer**, sans durcir le moteur Rust) et **différer le respawn** du processus moteur tant qu’un `agent.run` est actif.

---

## Docs

- [PLAN-1.5.10.md](PLAN-1.5.10.md) — périmètre, pilier P1–P4, smoke
- [GUIDE-RUN-RECOVERY.md](GUIDE-RUN-RECOVERY.md) — comportement actuel vs cible, flux Recommencer / Reprendre

---

## Contexte incident

Résumé dogfood : [`docs/chat.txt`](../../chat.txt) (boucle reasoning sans `file_write`, `drox client closed` après changement de modèle).

---

## Liens

- [Hub 1.5](../README.md)
- [CLOSURE 1.5.10](CLOSURE-1.5.10.md)
- [CLOSURE 1.5.9](../1.5.9/CLOSURE-1.5.9.md)
