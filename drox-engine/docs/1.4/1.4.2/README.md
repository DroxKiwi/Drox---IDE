# Drox 1.4.2 — UI chat & distribution Windows

**Statut** : **planifié** (après [1.4.1](../1.4.1/README.md) publiée)  
**Prérequis** : Phase **2d** ([FOI](../1.4.0/FOI-REFONTE.md#phase-2d--alignement-ui-fork-vs-code-p0)) · release **1.4.1** sur `Drox---IDE---OR`

---

## En une phrase

Polish **interface chat Drox** (B-UI-*) **et** installeur Windows **signé Authenticode** pour éliminer l’alerte SmartScreen « Éditeur inconnu » au premier lancement.

---

## Piliers

| Pilier | Contenu | Doc |
|--------|---------|-----|
| **Distribution** | Certificat Code Signing (EV recommandé) · `signtool` · intégration `drox:ship` · README OR installation | [PLAN § P1](PLAN-1.4.2.md#p1--signature-de-code-windows-smartscreen) |
| **UI chat** | Fil linéaire, replay, `ask_user`, blocs rail, busy stale | [PLAN § P2](PLAN-1.4.2.md#p2--ui-chat-b-ui-) |

---

## Contexte SmartScreen (1.4.1)

Sur Windows 10/11, l’installeur non signé affiche **Microsoft Defender SmartScreen** avec **Éditeur inconnu**. Ce n’est pas un défaut du binaire — il manque une **signature Authenticode** KDDS. La 1.4.2 livre le pipeline de signature + la doc utilisateur.

---

## Périmètre UI (B-UI-*)

| ID | Sujet |
|----|-------|
| B-UI-01 | Fichiers édités repliés |
| B-UI-02 | Lignes Ran / layout tray |
| B-UI-03 | Plan du run précédent non scellé |
| B-UI-04 | `ask_user` markdown + scroll ~8 lignes |
| B-UI-05 | Phase thinking active en tête vs chronologique |
| B-UI-06 | Chargement session à la réouverture (replay journal) |
| B-UI-07 | Run `busy` stale après fin / blur app |
| B-UI-08 | Panneau architecte : sélecteur contexte 16k→1M (`drox.numCtx`) | Livré (1.4.2 prep) |

---

## Hors scope

- Moteur rail / gates (figé 1.4.1)
- Index & graphe → [1.4.3](../1.4.3/PLAN-1.4.3.md)
- Profils sampling → [1.4.4](../1.4.4/README.md)
- Signature macOS / Linux

---

## Liens

- [Plan détaillé](PLAN-1.4.2.md)
- [Hub 1.4](../README.md)
- [06-UI-BLOCKS](../1.4.0/archive/06-UI-BLOCKS.md)
- [GUIDE-PUBLICATION-WIN32](../../operations/GUIDE-PUBLICATION-WIN32.md)
