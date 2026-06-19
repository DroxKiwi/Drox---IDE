# Drox 1.4.3 — Routage Auto, UI chat & distribution Windows

**Statut** : **reporté** — après [1.4.2](../1.4.2/README.md) (alignement modèles)  
**Prérequis** : [1.4.2](../1.4.2/README.md) · Phase **2d** ([FOI](../1.4.0/FOI-REFONTE.md#phase-2d--alignement-ui-fork-vs-code-p0)) · release **1.4.1** sur `Drox---IDE---OR`

---

## En une phrase

Corriger la **boucle analyse en mode Auto**, puis polish **interface chat** (B-UI-*) et installeur Windows **signé Authenticode**.

---

## Piliers

| Pilier | Contenu | Doc |
|--------|---------|-----|
| **Routage / boucle** | « Analyser le répertoire » en Auto → pas de rail EDIT + closure | [PLAN ROUTING](PLAN-1.4.3-ROUTING-ANALYZE-LOOP.md) **P0** |
| **Distribution** | Certificat Code Signing · `signtool` · `drox:ship` | [PLAN § P1](PLAN-1.4.3.md#p1--signature-de-code-windows-smartscreen) |
| **UI chat** | Fil, replay, `ask_user`, blocs rail, busy stale | [PLAN § P2](PLAN-1.4.3.md#p2--ui-chat-b-ui-) |

---

## Contexte — boucle analyse (dogfood 2026-06-18)

Brief **« Salut, tu peux analyser le répertoire ? »** en **Auto** : run `architect_edit`, 16 itérations READ, pas de `[phase: answering]`, `run stopped`. Reproductible sur plusieurs modèles → **bug routage moteur**, pas LLM.

Analyse complète + pistes de fix : [PLAN-1.4.3-ROUTING-ANALYZE-LOOP.md](PLAN-1.4.3-ROUTING-ANALYZE-LOOP.md).  
Export : [`chat_north-mini-code`](../chat_north-mini-code).  
Smoke post-F1 (2026-06-18) : [SMOKE-ses_7df5045c](SMOKE-ses_7df5045c.md) — **F1 validé** run 2 ; échec EDIT run 3.

---

## Contexte SmartScreen (1.4.1)

Sur Windows 10/11, l’installeur non signé affiche **Microsoft Defender SmartScreen** avec **Éditeur inconnu**. Ce n’est pas un défaut du binaire — il manque une **signature Authenticode** KDDS. La 1.4.3 livre le pipeline de signature + la doc utilisateur.

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
| B-UI-08 | Panneau architecte : sélecteur contexte 16k→1M (`drox.numCtx`) | Livré (1.4.3 prep) |

---

## Hors scope

- Index & graphe → [1.4.4](../1.4.4/PLAN-1.4.4.md)
- Profils sampling → [1.4.5](../1.4.5/README.md)
- Signature macOS / Linux

---

## Liens

- [Plan routage / boucle analyse](PLAN-1.4.3-ROUTING-ANALYZE-LOOP.md)
- [Plan détaillé UI + signature](PLAN-1.4.3.md)
- [Hub 1.4](../README.md)
- [06-UI-BLOCKS](../1.4.0/archive/06-UI-BLOCKS.md)
- [GUIDE-PUBLICATION-WIN32](../../operations/GUIDE-PUBLICATION-WIN32.md)
