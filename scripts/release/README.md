# Scripts release Drox IDE

**Source de vérité** pour build Windows/Linux et publication.  
Guides pas à pas : [docs/release/](../../docs/release/README.md) · référence rapide [00-BUILD-REFERENCE.md](../../docs/release/00-BUILD-REFERENCE.md).

Les scripts à la racine `scripts/*.ps1` / `scripts/*.sh` (sans `release/`) sont des **forwarders** vers ce dossier.

---

## Commandes (depuis la racine `<REPO>`)

| Objectif | Commande |
|----------|----------|
| Release Windows (`.exe` + manifeste) | `npm run drox:ship -- -Force` |
| Release Linux (clone WSL isolé) | `.\scripts\release\wsl-linux-build-isolated.ps1` ou `.\scripts\wsl-linux-build.ps1` |
| Dev Windows cassé après WSL sur `/mnt/c` | `.\scripts\release\restore-windows-dev.ps1` |

Log build Linux isolé : `.build\wsl-linux-build-isolated.log`

---

## Fichiers dans ce dossier

| Script | Rôle |
|--------|------|
| `drox-release.ps1` | Pipeline Windows (`npm run drox:build` / `drox:ship` / `drox:publish`) |
| `build-release-win32.ps1` | Compile + installeur Inno |
| `release-publish-win32.ps1` | Manifeste `stable/latest.json` (win32) |
| `wsl-linux-build-isolated.ps1` | **Entrée** build Linux depuis PowerShell Windows |
| `wsl-linux-build.sh` | Pipeline WSL dans `~/Drox---IDE` |
| `build-release-linux.sh` | `.deb` + app packagée |
| `release-publish-linux.sh` | Manifeste linux-x64 |
| `restore-windows-dev.ps1` | Réparer `node_modules` Windows |
| `restore-windows-dev-deps.ps1` | Alias (`-Quick` → shims seulement) |

Helpers restent dans `scripts/` (hors `release/`) : `package-drox.sh`, `verify-packaged-linux.sh`, `lib/linux-*.sh`, `ensure-inno-setup.ps1`, etc.

---

## sudo WSL (première fois)

Depuis PowerShell, le mot de passe sudo n’est pas saisissable — une fois en WSL interactif :

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libx11-dev libxkbfile-dev \
  libsecret-1-dev libkrb5-dev fakeroot rpm lintian curl git ca-certificates
```

Puis relancer `wsl-linux-build-isolated.ps1`.

---

## Enchaînement

```text
npm run drox:ship          →  release/drox-release.ps1 (+ build-release-win32 + publish win32)
wsl-linux-build-isolated  →  wsl-linux-build.sh → build-release-linux → release-publish-linux
restore-windows-dev       →  seulement si dev Windows pollué par npm WSL sur /mnt/c
```
