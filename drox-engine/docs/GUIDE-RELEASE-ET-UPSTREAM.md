# Guide release Drox + upstream VS Code

> **Doc opérationnelle** : préférer les guides linéaires dans [operations/](operations/README.md).

| Besoin | Guide |
|--------|--------|
| Ouvrir branche, dev, merge `main` | [01-BRANCHE.md](operations/01-BRANCHE.md) |
| Mise à jour VS Code (upstream) | [02-UPSTREAM-VSCODE.md](operations/02-UPSTREAM-VSCODE.md) |
| Release Windows → OR | [03-RELEASE-WINDOWS.md](operations/03-RELEASE-WINDOWS.md) |
| Release Linux → OR | [04-RELEASE-LINUX.md](operations/04-RELEASE-LINUX.md) |
| Open VSX | [05-OPEN-VSX.md](operations/05-OPEN-VSX.md) |

---

## Règles (rappel)

1. **`<REPO>`** = sources `Drox---IDE` · **`<OR>`** = `Drox---IDE---OR` (release publique, pas de sources).
2. **`main` sources** ≠ canal de distribution — les binaires vont sur **GitHub Release OR**.
3. **Upstream Microsoft** → branche locale `integrate/*`, jamais merge direct sur `main` sources.
4. **Installeurs** jamais dans git — dossier `<OR>\_upload\`.

Patches build après upstream : [PATCHES-UPSTREAM-BUILD.md](1.3/1.3.0/finalisation/PATCHES-UPSTREAM-BUILD.md)

Conventions git / versioning : [RULES.md](../../RULES.md)
