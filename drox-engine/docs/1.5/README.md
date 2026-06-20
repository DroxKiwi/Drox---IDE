# Ligne de version 1.5

**Prérequis** : [1.4.2](../1.4/1.4.2/README.md) tag `v1.4.2` · refonte moteur **profonde**

---

## Statut actuel

| Dossier | Périmètre | Statut |
|---------|-----------|--------|
| [**1.5.0/**](1.5.0/README.md) | **Remplacement total** moteur TUI → `drox.exe` + shim IDE | **Clôturé** (moteur) · merge upstream en attente |
| [**1.5.1/**](1.5.1/README.md) | Routage Auto + UI chat + signature Windows | Après **ship 1.5.0** |
| [**1.5.2/**](1.5.2/README.md) | Index / graphe / fast path / onboarding | Planifié |
| [**1.5.3/**](1.5.3/README.md) | Profils sampling LLM par contexte (dev) | Planifié |

---

## En une phrase

**1.5.0** = **table rase** du moteur 1.4.x : workspace **TUI** dans `drox-engine/drox`, **shim RPC** pour **Drox IDE**, dogfood 3 scénarios validés. **`droxVersion` 1.5.0**. Prochaine étape release : merge upstream VS Code puis `drox:ship`.

---

## Séquence

```text
1.4.2 tag v1.4.2 (point de restauration)
    → 1.5.0 remplacement moteur + shim IDE   ← clôturé (branche 1.5.0)
        → merge upstream (5.8–5.9)
        → ship installeur + tag v1.5.0
            → 1.5.1 routage / UI / signature
                → 1.5.2 index / graphe
                    → 1.5.3 profils sampling
```

---

## Liens

- [CLOSURE 1.5.0](1.5.0/CLOSURE-1.5.0.md)
- [Hub 1.4](../1.4/README.md)
- [GUIDE publication](../operations/GUIDE-PUBLICATION-WIN32.md)
