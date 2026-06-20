# Ligne de version 1.4

**Branche cible** : `1.4.0`  
**Prérequis** : [1.3.4](../1.3/1.3.4/README.md) clôturée

---

## Statut actuel

| Dossier | Périmètre | Statut |
|---------|-----------|--------|
| [**FOI-REFONTE**](1.4.0/FOI-REFONTE.md) | **Document de référence** — suppressions, modifs, règles | **Fait foi** |
| [**1.4.0/**](1.4.0/README.md) | Hub squelette + annexes | **Actif** |
| [**moteur/**](moteur/README.md) | Carte fonctionnelle (audit code) | Référence |
| [**1.4.1/**](1.4.1/README.md) | Stabilisation bugs | **Clôturée** — [CLOSURE](1.4.1/finalisation/CLOSURE-1.4.1.md) |
| [**1.4.2/**](1.4.2/README.md) | Rail observateur + contexte 4 couches | **Clôturée** (juin 2026) |

**Suite moteur** : [**1.5/**](../1.5/README.md) — refonte post-1.4.2 (ex-plans 1.4.3 → 1.5.1, 1.4.4 → 1.5.2, 1.4.5 → 1.5.3)

| [**1.4.1.3/**](1.4.1/1.4.1.3/README.md) | Context Frame · dossiers outils · plan interne | **Phase 1–2** (post-1.4.1.2) |

---

## En une phrase

**1.4.0** = un modèle architecte, un conducteur rail, table rase des reliquats multi-modèle et guide 1.3.

---

## Entrées rapides 1.4.0

1. [README](1.4.0/README.md) — décisions D1–D5  
2. [SQUELETTE](1.4.0/SQUELETTE.md) — recette unique  
3. [PLAN-ATTAQUE](1.4.0/PLAN-ATTAQUE.md) — phases 0–6  
4. [SUPPRESSIONS](1.4.0/SUPPRESSIONS.md) — inventaire code à retirer  
5. [09-TEST-PLAN](1.4.0/09-TEST-PLAN.md) — validation  

Archive première tentative : [1.4.0/archive/](1.4.0/archive/README.md)

---

## Séquence

```text
1.3.4 clôturée
    → 1.4.0 squelette (table rase + smoke)
        → 1.4.1 stabilisation
            → 1.4.2 rail observateur + 4 couches  ← clôturée
                → 1.5 refonte moteur (voir ../1.5/)
                    → 1.5.1 routage / UI / signature Windows
                        → 1.5.2 index / graphe
                            → 1.5.3 profils sampling LLM (dev)
```

---

## Liens

- [1.3 — hub](../1.3/README.md)
- [Carte moteur](moteur/README.md)
- [chat dogfood](../1.3/chat_qwen27b.txt)
