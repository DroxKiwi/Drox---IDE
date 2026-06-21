# Ligne de version 1.5

**Prérequis** : [1.4.2](../1.4/1.4.2/README.md) tag `v1.4.2` · refonte moteur **profonde**

---

## Statut actuel

| Dossier | Périmètre | Statut |
|---------|-----------|--------|
| [**1.5.0/**](1.5.0/README.md) | **Remplacement total** moteur TUI → `drox.exe` + shim IDE | **Clôturé** · release OR **1.5.0** |
| [**1.5.1/**](1.5.1/README.md) | **Parité fil chat / TUI** + wizard connexion | **Livré** · `v1.5.1` |
| [**1.5.1b/**](1.5.1b/README.md) | **Release Linux** (`.deb` amd64, même tag) | **Livré** (pipeline) |
| [**1.5.2/**](1.5.2/README.md) | Index / graphe / fast path / onboarding | Planifié |
| [**1.5.3/**](1.5.3/README.md) | Profils sampling LLM par contexte (dev) | Planifié |

---

## En une phrase

**1.5.0** = moteur TUI + shim IDE · **livré** (`v1.5.0`).  
**1.5.1** = fil Drox Chat aligné sur le TUI · wizard connexion · **livré** (`v1.5.1`, Windows + Linux).

---

## Séquence

```text
1.5.0 moteur + shim + ship          ← fait
    → 1.5.1 parité fil + release win/linux  ← fait (v1.5.1)
        → 1.5.2 index / graphe
            → 1.5.3 profils sampling
```

---

## Liens

- [CLOSURE 1.5.0](1.5.0/CLOSURE-1.5.0.md)
- [Hub 1.4](../1.4/README.md)
- [GUIDE publication Windows](../operations/GUIDE-PUBLICATION-WIN32.md)
- [GUIDE publication Linux](../operations/GUIDE-PUBLICATION-LINUX.md)
- [PLAN 1.5.1b](1.5.1b/PLAN-1.5.1b.md)
