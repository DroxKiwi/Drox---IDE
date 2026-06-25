# 00 — Build Windows & Linux (référence rapide)

**Lire en premier** si vous ne savez plus quelle commande lancer.

Guides détaillés : [03 Windows](03-RELEASE-WINDOWS.md) · [04 Linux](04-RELEASE-LINUX.md) · [scripts](scripts/README.md)

---

## Deux dossiers, deux rôles

| Dossier | OS | Rôle |
|---------|-----|------|
| `C:\…\Drox---IDE` | Windows | **Dev** (`npm run watch`, `code.bat`) + **build Windows** |
| `~/Drox---IDE` (WSL ext4) | Linux | **Build Linux uniquement** (créé automatiquement) |
| `Drox---IDE---OR` | — | **Publication** (manifestes + GitHub Releases) |

**Ne jamais** lancer `npm install` sous WSL sur `C:\…` via `/mnt/c/` — ça casse le dev Windows.

---

## Ce qu'il faut utiliser

### Dev au quotidien (Windows)

```powershell
cd C:\Users\coren\Desktop\GitHub\Drox---IDE
npm run watch
.\scripts\code.bat
```

### Release Windows (`.exe`)

```powershell
cd <REPO>
npm run drox:ship -- -Force    # recompile · -Fast si déjà compilé
```

→ [03-RELEASE-WINDOWS.md](03-RELEASE-WINDOWS.md)

### Release Linux (`.deb`) — **commande unique**

```powershell
cd <REPO>
.\drox-engine\docs\operations\scripts\wsl-linux-build-isolated.ps1
```

- Commit auto des changements locaux
- Sync `~/Drox---IDE` (clone séparé — **ne touche pas** `node_modules` Windows)
- Durée : 1–3 h · Log : `.build\wsl-linux-build-isolated.log`

**Prérequis une fois** : paquets apt dans WSL ([README § Setup](README.md#setup-machine-une-fois)).

→ [04-RELEASE-LINUX.md](04-RELEASE-LINUX.md)

### Ordre release complète

```
Windows (03)  →  Linux isolé (04 §2)  →  commit OR + gh release upload
```

Windows **avant** Linux (manifeste `latest.json`).

---

## Ce qu'il ne faut **plus** utiliser

| ❌ Éviter | Pourquoi |
|----------|----------|
| `wsl-linux-build.ps1` | Build sur `/mnt/c/` — `node_modules` partagé, esbuild/ssh2 cassés, `restore-windows-dev` souvent nécessaire |
| `npm install` dans WSL sur `/mnt/c/…/Drox---IDE` | Même problème |
| `build-release-linux.sh` à la main sous `/mnt/c/` | Idem |
| `restore-windows-dev.ps1` après build **isolé** | Inutile — réservé au flux legacy ci-dessus |

Le flux legacy reste documenté en [04 §2bis](04-RELEASE-LINUX.md) pour dépannage uniquement.

---

## Dépannage express

| Symptôme | Action |
|----------|--------|
| `npm run watch` / `code.bat` cassés après WSL sur `/mnt/c/` | `.\drox-engine\docs\operations\scripts\restore-windows-dev.ps1` |
| Build Linux : `sudo` bloqué | Terminal WSL interactif → `sudo apt-get install …` ([README](README.md)) |
| Build Linux : `ETIMEDOUT` / réseau npm | Relancer `wsl-linux-build-isolated.ps1` |
| Build Linux : `EBADPLATFORM` win32 | Utiliser le script **isolé**, pas `wsl-linux-build.ps1` |

---

## Hotfix sur version déjà publiée

→ [06-HOTFIX-LATEST.md](06-HOTFIX-LATEST.md) (Windows `drox:ship`, Linux **isolé**)
