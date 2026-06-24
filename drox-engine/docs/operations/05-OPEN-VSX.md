# 05 — Galerie extensions (Open VSX)

Optionnel. Le `product.json` **source** n’a pas `extensionsGallery` (hygiene) — injection au **build** via `product.gallery.json`.

---

## Modifier la galerie

Éditer **uniquement** :

```
<REPO>/product.gallery.json
```

Ne **jamais** committer `extensionsGallery` dans `product.json` source.

---

## Vérifier en dev

```powershell
.\scripts\code.bat
```

Extensions → recherche `Git Graph` → Install.

Override local (gitignoré) : `product.overrides.json` à la racine.

---

## Release — merge automatique

Déjà appelé dans `build-release-win32.ps1` et `build-release-linux.sh`.

Manuel sur un package existant :

```powershell
node scripts/lib/merge-product-gallery.mjs ..\VSCode-win32-x64
```

---

## Vérifier le package

```powershell
# Windows : intégré à drox-bundle-readiness
# Linux :
./scripts/verify-packaged-linux.sh
```

Le `product.json` packagé doit contenir `open-vsx.org` dans `extensionsGallery.serviceUrl`.

---

## Problèmes

| Symptôme | Action |
|----------|--------|
| Vue Extensions vide en release | Relancer build ou `merge-product-gallery.mjs` sur le package |
| Extension introuvable | Normal si Microsoft-only / absent d’Open VSX |

Fichiers : `scripts/lib/merge-product-gallery.mjs` · `src/bootstrap-meta.ts`
