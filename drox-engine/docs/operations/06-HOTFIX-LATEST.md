# 06 — Hotfix sur la release courante (`latest`)

Corriger un bug **après** publication de `<DROX_VER>` sur **`<OR>`**, **sans** ouvrir une nouvelle version produit.

Guides release complète : [03-RELEASE-WINDOWS.md](03-RELEASE-WINDOWS.md) · [04-RELEASE-LINUX.md](04-RELEASE-LINUX.md)  
Scripts WSL / retour dev Windows : [scripts/README.md](scripts/README.md)

---

## Hotfix ou nouvelle version ?

| Situation | Action |
|-----------|--------|
| Bug bloquant sur la **dernière** release publiée | Hotfix **même** `<DROX_VER>` sur `<OR>` (ce guide) |
| Nouvelle fonctionnalité, bump marketing | Branche `<BRANCH>` + nouveau `droxVersion` → [01-BRANCHE.md](01-BRANCHE.md) |
| Bump base VS Code | [02-UPSTREAM-VSCODE.md](02-UPSTREAM-VSCODE.md) |

**Règle** : les binaires corrigés remplacent les assets sur la **même** GitHub Release `v<DROX_VER>`. Le manifeste `stable/latest.json` est mis à jour (nouveau `sha256`, même `version`).

---

## 1. Corriger le code (sources)

```powershell
cd <REPO>
# main ou branche déjà validée
```

| Zone touchée | Rebuild typique |
|--------------|-----------------|
| `src/vs/workbench/contrib/drox/` | `npm run drox:ship -- -Force` |
| `drox-engine/` (moteur Rust) | `cargo build --release -p drox-cli` puis ship |
| Les deux | `-Force` (recompile TS + rebundle moteur) |

Commit sur `<REPO>` quand le correctif est prêt (smoke local OK).

---

## 2. Notes utilisateur

**Popup « What's new »** (splash au premier lancement) — `src/vs/workbench/contrib/drox/common/droxReleaseNotes.ts` :

- Ajouter / compléter le `case '<DROX_VER>':` si absent.
- Les utilisateurs qui ont **déjà** validé le splash pour cette version ne le reverront pas (stockage `drox.releaseNotes.seenVersion`).

**GitHub Release + MAJ auto** — éditer `<OR>\stable\<DROX_VER>\RELEASE_NOTES.md` :

```markdown
## Correctifs (date)

- Description du correctif…
```

Conserver la section **Nouveautés** existante.

---

## 3. Hotfix Windows

**Avant** : arrêter `npm run watch` et fermer `.\scripts\code.bat`.

```powershell
cd <REPO>
npm run drox:ship -- -Force
```

| Cas | Commande |
|-----|----------|
| Bundle déjà aligné, re-package seulement | `npm run drox:ship -- -Fast` |
| Échec `extensionsGallery.serviceUrl` | `node scripts/lib/merge-product-gallery.mjs ..\VSCode-win32-x64` puis relancer Inno (voir [03](03-RELEASE-WINDOWS.md)) |

`drox:ship` copie l’installeur dans `<OR>\_upload\` et met à jour `stable/latest.json` (**merge** win32 — ne supprime pas linux).

```powershell
cd <OR>
git add stable/
git commit -m "Release v<DROX_VER> hotfix win32-x64 (manifest)."
git push origin main

gh release upload <TAG> ".\_upload\Drox-IDE-Setup-<DROX_VER>-win32-x64.exe" `
  --repo DroxKiwi/Drox---IDE---OR --clobber

gh release edit <TAG> --repo DroxKiwi/Drox---IDE---OR `
  --notes-file ".\stable\<DROX_VER>\RELEASE_NOTES.md"
```

---

## 4. Hotfix Linux

**Avant** le hotfix Windows si vous republiez les deux la même journée (évite de perdre win32 dans `latest.json` lors d’opérations manuelles).

Arrêter `npm run watch` et fermer `code.bat` sur Windows.

```powershell
cd <REPO>
.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1
```

Commit auto + clone `~/Drox---IDE`. Log : `.build\wsl-linux-build-isolated.log` · [00-BUILD-REFERENCE.md](00-BUILD-REFERENCE.md)

Manifeste :

```bash
./scripts/release-publish-linux.sh
```

```powershell
cd <OR>
git add stable/
git commit -m "Release v<DROX_VER> hotfix linux-x64 (manifest)."
git push origin main

gh release upload <TAG> ".\_upload\Drox-IDE-<DROX_VER>-linux-x64.deb" `
  --repo DroxKiwi/Drox---IDE---OR --clobber
```

---

## 5. Reprendre le dev Windows

Après **tout** `npm install` ou build Linux sur `/mnt/c/`, le `node_modules` partagé casse souvent le dev Windows.

```powershell
cd <REPO>
.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1
npm run watch
.\scripts\code.bat
```

Voir [scripts/README.md](scripts/README.md) pour le détail (shims `.cmd` vs addons `.node` ELF).

---

## 6. Vérifier

| Contrôle | Attendu |
|----------|---------|
| `<OR>\stable\latest.json` | `version` = `<DROX_VER>` · `sha256` mis à jour · **win32 + linux** présents |
| GitHub Release `<TAG>` | Assets `.exe` / `.deb` datés récents (`--clobber`) |
| Install frais ou MAJ auto | Correctif visible en prod |
| Dev local | `watch` + `code.bat` OK après `restore-windows-dev.ps1` |

---

## Problèmes fréquents (hotfix)

| Symptôme | Cause | Action |
|----------|--------|--------|
| `'npm-run-all2' n'est pas reconnu` après WSL | shims Windows remplacés | `restore-windows-dev.ps1` |
| `*.node n'est pas une application Win32 valide` | binaires natifs Linux dans `node_modules` | Idem (rebuild Win32) |
| `EBADPLATFORM` `@*-win32-*` | `npm install` sur `/mnt/c/` au lieu du clone isolé | `wsl-linux-build-isolated.ps1` |
| `postinstall.ts` / `EIO` `esbuild.exe` | idem | clone isolé ; `restore-windows-dev.ps1` si dev Windows cassé |
| `bash\r: No such file or directory` (WSL) | script `.sh` en CRLF | LF sur les `.sh` (`.gitattributes` : `eol=lf`) |
| `EACCES` pendant `drox:ship` | `node_modules` verrouillé / artefact WSL | Arrêter watch · `restore-windows-dev.ps1` · supprimer dossiers `node_modules` imbriqués cassés |
| `latest.json` sans `linux-x64` | publish win32 ancien (écrasement) | `node scripts/lib/drox-release-manifest.mjs merge --platform linux-x64 …` |
| Splash inchangé pour utilisateurs déjà en 1.5.x | `seenVersion` déjà posé | Normal pour hotfix même semver · notes GitHub + MAJ auto suffisent |

---

## Enchaînement type (rappel)

```text
Correctif sources → notes (splash + RELEASE_NOTES.md)
    → hotfix Windows (ship + OR + gh upload --clobber)
    → hotfix Linux (wsl-linux-build-isolated + publish + gh upload --clobber)
    → restore-windows-dev.ps1 (seulement si dev Windows casse)
    → smoke
```

Pas de release « hotfix » sur `main` sources : la distribution reste **`<OR>`** uniquement.
