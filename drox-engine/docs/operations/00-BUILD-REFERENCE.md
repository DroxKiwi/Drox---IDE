# 00 — Build Windows & Linux (référence rapide)

**Lire en premier** si vous ne savez plus quelle commande lancer.

Guides détaillés : [03 Windows](03-RELEASE-WINDOWS.md) · [04 Linux](04-RELEASE-LINUX.md) · [scripts](scripts/README.md)

---

## Deux dossiers, deux rôles

| Dossier | OS | Rôle |
|---------|-----|------|
| `C:\…\Drox---IDE` | Windows | **Dev** (`npm run watch`, `code.bat`) + **build Windows** |
| `~/Drox---IDE` (WSL ext4) | Linux | **Build Linux uniquement** (créé par le script isolé) |
| `Drox---IDE---OR` | — | **Publication** (manifestes + GitHub Releases) |

**Ne jamais** lancer `npm install` sous WSL sur `C:\…` via `/mnt/c/`.

---

## Commandes

### Dev (Windows)

```powershell
npm run watch
.\scripts\code.bat
```

### Release Windows (`.exe`)

```powershell
npm run drox:ship -- -Force
```

→ [03-RELEASE-WINDOWS.md](03-RELEASE-WINDOWS.md)

### Release Linux (`.deb`)

```powershell
.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1
# ou : .\scripts\wsl-linux-build.ps1   (même chose)
```

→ [04-RELEASE-LINUX.md](04-RELEASE-LINUX.md)

### Ordre release complète

```
Windows (03)  →  Linux isolé (04)  →  OR + gh release upload
```

---

## Dépannage

| Symptôme | Action |
|----------|--------|
| `watch` / `code.bat` cassés | `restore-windows-dev.ps1` (erreur passée sur `/mnt/c/`) |
| Build Linux : sudo bloqué | `sudo apt-get install …` dans WSL interactif ([README](README.md)) |
| Build Linux : réseau npm (`ETIMEDOUT`) | Relancer `wsl-linux-build-isolated.ps1` |

---

## Hotfix

→ [06-HOTFIX-LATEST.md](06-HOTFIX-LATEST.md)
