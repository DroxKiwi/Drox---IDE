# Audit écart upstream VS Code — 1.5.0

**Date** : 2026-06-20  
**Branche auditée** : `1.5.0`  
**Cible** : `upstream/main` (microsoft/vscode)

---

## Versions

| Composant | Version |
|-----------|---------|
| Fork Drox (`package.json` `version`) | **1.122.0** |
| Fork Drox (`droxVersion`) | **1.5.0** |
| `upstream/main` HEAD | `43e100f3` — *chat: hide Agent Host Copilot response identity* |

---

## Divergence git

```powershell
git fetch upstream
git rev-list --count HEAD..upstream/main   # commits upstream non intégrés
git rev-list --count upstream/main..HEAD   # commits Drox uniquement
```

| Métrique | Valeur (2026-06-20) |
|----------|---------------------|
| Commits en retard sur `upstream/main` | **~159 617** |
| Commits en avance (couche Drox) | **~47** |

Le fork est ancré sur la base **1.122.x** ; `upstream/main` a continué d’évoluer (milliers de commits OSS).

---

## Zones à préserver au merge (ours)

| Chemin | Raison |
|--------|--------|
| `src/vs/workbench/contrib/drox/` | Chat Drox, RPC, webview |
| `drox-engine/` | Moteur TUI + docs |
| `resources/drox/` | Binaire `drox.exe` packagé |
| `product.json` / patches Nexus | Branding Drox |
| Scripts `scripts/drox-*`, `package-drox.ps1` | Pipeline release |

---

## Procédure recommandée (Phase 5.8–5.9)

1. `git checkout -b integrate/vscode-from-1.5.0` depuis `1.5.0`
2. `git merge upstream/main` (ou rebase si politique fork le permet)
3. Résoudre conflits : **ours** sur la table ci-dessus
4. `.\scripts\list-nexus-patches.ps1` — vérifier patches fork
5. `npm run compile`
6. `cargo test --workspace` dans `drox-engine/drox`
7. F5 · smoke Drox Chat (3 scénarios)
8. Ajuster `version` racine si saut upstream majeur ([RULES.md](../../../../RULES.md))

---

## Liens

- [CLOSURE-1.5.0.md](CLOSURE-1.5.0.md)
- [PLAN-1.5.0.md](PLAN-1.5.0.md) § Phase 5.7–5.9
- [ARCHITECTURE-DECOUPLAGE-UPSTREAM](../../1.2/steps/03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md)
