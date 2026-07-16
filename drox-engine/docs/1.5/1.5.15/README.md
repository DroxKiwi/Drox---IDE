# 1.5.15 — Accès hors workspace (toggle session)

**Statut** : en cours  
**Version** : `droxVersion` **1.5.15**

## Objectif

Sur la carte / historique de session (même barre d’icônes que la persistance background), une **icône** permet d’autoriser le modèle à lire / écrire / naviguer **hors** du répertoire workspace de la discussion.

Par défaut : confinement workspace inchangé (`path escapes workspace`).

## Livrables

- [ ] Toggle session (toolbar)
- [ ] Flag `allowOutsideWorkspace` → `agent.run` + tools Rust / client
- [ ] Supplément prompt quand activé
