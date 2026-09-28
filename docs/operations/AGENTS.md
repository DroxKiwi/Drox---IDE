# Instructions agent — opérations Drox IDE

**Lire en premier** : [00-BUILD-REFERENCE.md](00-BUILD-REFERENCE.md)

Ce dossier documente **build release Windows/Linux** et **publication OR**. Ne pas inventer d’autres chemins de scripts.

---

## Règles absolues

1. **Windows dev** = `C:\…\Drox---IDE` — `npm run watch`, `.\scripts\code.bat`
2. **Linux release** = clone WSL isolé `~/Drox---IDE` (ext4) — **jamais** `npm install` sur `/mnt/c/…`
3. **Publication** = `Desktop\GitHub\Drox---IDE---OR` (manifestes + `gh release upload`) — **pas** `~/Drox---IDE---OR` du clone WSL isolé
4. **Ne pas** `git merge upstream/main` directement sur `main` sources → [02-UPSTREAM-VSCODE.md](02-UPSTREAM-VSCODE.md)
5. **Ne pas** committer `.exe` / `.deb` dans git

---

## Commandes (copier-coller)

| Objectif | Commande (depuis racine `<REPO>` Windows) |
|----------|-------------------------------------------|
| Release Windows | `npm run drox:ship -- -Force` |
| Release Linux | `.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1` |
| Dev cassé (legacy `/mnt/c`) | `.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1` |

Log build Linux : `.build\wsl-linux-build-isolated.log`

---

## Dépannage build Linux (ordre)

| Erreur / symptôme | Cause probable | Action |
|-------------------|----------------|--------|
| `EBADPLATFORM` win32 | `npm install` WSL sur `/mnt/c` | Script **isolé** uniquement |
| `code-open-folder.desktop` manquant | Fichier perdu au merge upstream | Restaurer `resources/linux/code-open-folder.desktop` |
| `dpkg-shlibdeps` + `libc.musl` / `@parcel/watcher-linux-x64-musl` | Binaires musl dans le paquet glibc | Relancer build (strip auto) ; voir `scripts/lib/linux-strip-packaged-natives.sh` |
| `sudo` bloqué depuis PowerShell | apt interactif requis | [scripts/README.md](scripts/README.md) § sudo |
| `ETIMEDOUT` npm | Réseau | Relancer le script isolé |
| `latest.json` sans win32 | Linux publié avant Windows | Refaire [03-RELEASE-WINDOWS.md](03-RELEASE-WINDOWS.md) |
| Manifeste OR au mauvais endroit | `release-publish-linux` depuis `~/Drox---IDE` sans `DROX_RELEASES_REPO` | [04 §4](04-RELEASE-LINUX.md#4-manifeste-or) — chemin `/mnt/c/.../Drox---IDE---OR` |

---

## Après merge upstream VS Code

Vérifier que ces fichiers Drox existent encore :

- `resources/linux/code-open-folder.desktop`
- `product.json` : `linuxIconName`, `applicationName`
- `build/gulpfile.vscode.linux.ts` : entrées desktop cohérentes

Détail : [02-UPSTREAM-VSCODE.md](02-UPSTREAM-VSCODE.md) § Checklist post-merge.

---

## Fichiers scripts (seule source de vérité)

| Script | Rôle |
|--------|------|
| `scripts/wsl-linux-build-isolated.ps1` | **Entrée Linux** depuis Windows |
| `scripts/wsl-linux-build.sh` | Pipeline dans WSL (`~/Drox---IDE`) |
| `scripts/restore-windows-dev.ps1` | Réparer dev Windows |
| `scripts/build-release-linux.sh` | Build `.deb` (appelé par wsl-linux-build) |
| `scripts/lib/linux-npm-install.sh` | `npm install --force` + strip watchers |
| `scripts/lib/linux-strip-packaged-natives.sh` | Avant `prepare-deb` |

Alias racine `scripts\wsl-linux-build.ps1` → isolé.

---

## Parcours documenté

```
00 (référence) → 01 (branche) → [02 upstream] → 03 Windows → 04 Linux → OR + gh upload
Hotfix sur latest déjà publié → 06
```
