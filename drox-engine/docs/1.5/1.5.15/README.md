# 1.5.15 — Hors workspace · Retry · Carnet de session

**Statut** : en cours (code RT+NB en place)  
**Version** : `droxVersion` **1.5.15**  
**Plan** : [PLAN-1.5.15.md](PLAN-1.5.15.md)  
**Trace Rust** : [ENGINE-RUST-1.5.15.md](ENGINE-RUST-1.5.15.md) — OW uniquement ; **RT + NB = zéro Rust**

## Piliers

| # | Sujet | Statut |
|---|--------|--------|
| **OW** | Toggle session — accès hors workspace (cadenas) | ✅ livré |
| **RT** | Retry sur erreur moteur (502…) — Agents + IDE | ✅ implémenté |
| **NB** | Carnet markdown par discussion (icône note, modal, `.drox/sessions`) | ✅ N0 (injection `system`) |

## Retry (RT)

- **IDE** : bouton **Retry** sur la bulle d’erreur → `restartRunAfterError` (truncate + `skipUserTurn`)
- **Agents** : `errorDetails.confirmationButtons` → restore dernier prompt + truncate + `skipUserTurn`

## Carnet (NB)

- Fichier : `.drox/sessions/<ses_*>.notes.md` (template EN)
- Toolbar : `Codicon.note` → Modal Editor (`MODAL_GROUP` scoped)
- Injection : `startDroxAgentRun` lit le carnet et envoie `system` (plafond 12 KiB)
- Delete : inclus dans `droxSessionArtifactPaths`

## Moteur

**Décision** : N0 — **aucune** modif Rust pour RT/NB. Seul OW touche le crate (voir audit).
