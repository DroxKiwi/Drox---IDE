# Plan 1.5.4 — Release Linux + confiance Windows (installeur)

**Version** : juin 2026  
**Base** : [1.5.3](../1.5.3/PLAN-1.5.3.md) · pipeline préparé [1.5.1b](../1.5.1b/PLAN-1.5.1b.md)  
**Branche** : `1.5.4` · tag **`v1.5.4`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **L0** Release Linux | **~90 %** — scripts hérités 1.5.1b | validation Ubuntu |
| **L1** Publish manifest multi-plateforme | **~95 %** | non |
| **L2** CI GitHub Actions | **~80 %** | premier run |
| **L3** Smoke Linux | 0 % | oui |
| **W1** Confiance Windows (Authenticode) | 0 % | UX install Windows |

**Prochaine étape** : build `.deb` · ship OR · traiter SmartScreen « Éditeur inconnu ».

---

## Objectif

| In | Hors scope |
|----|------------|
| `.deb` **linux-x64** (amd64) sur `Drox---IDE---OR` | macOS |
| `platforms.linux-x64` dans `stable/latest.json` | Snap, Flatpak, AppImage |
| `resources/drox/linux-x64/drox` embarqué | ARM64 Linux |
| **Installeur Windows signé** (Authenticode) — fin alerte « Éditeur inconnu » / SmartScreen | Signature GPG repo Linux |
| Tag **`v1.5.4`** (`.deb` + setup `.exe` signé si W1 livré) | Notarization macOS |

---

## Checklist

### Fondations (fait — 1.5.1b)

- [x] `build-release-linux.sh`, `release-publish-linux.sh`, `verify-packaged-linux.sh`
- [x] `drox-release-manifest.mjs` (merge win32 + linux)
- [x] `wsl-linux-build.ps1` / `.sh`
- [x] Workflow `.github/workflows/drox-release-linux.yml`
- [x] [GUIDE-PUBLICATION-LINUX.md](../../operations/GUIDE-PUBLICATION-LINUX.md)

### Ship 1.5.4

- [ ] `droxVersion` **1.5.4** dans `package.json`
- [ ] Build `.deb` (Ubuntu / WSL / CI)
- [ ] `release-publish-linux.sh` → merge `linux-x64`
- [ ] Commit manifeste `Drox---IDE---OR` · `git push`
- [ ] `gh release create v1.5.4` + upload `.deb` (win32 si ship couplé)
- [ ] Smoke Ubuntu : install · `drox-ide` · run agent · MAJ auto

### W1 — Confiance Windows (SmartScreen / « Éditeur inconnu »)

Aujourd’hui l’installeur Inno (`Drox-IDE-Setup-*-win32-x64.exe`) est **non signé** : Windows Defender SmartScreen affiche **« Éditeur inconnu »** au premier lancement — friction majeure pour les utilisateurs.

| # | Tâche | Détail |
|---|--------|--------|
| W1-1 | Choisir certificat **Code Signing** | EV recommandé (réputation SmartScreen plus rapide) · stockage HSM ou fichier `.pfx` sécurisé |
| W1-2 | Script `sign-drox-win32.ps1` (ou intégration `build-release-win32.ps1`) | `signtool` (Windows SDK) · signer **setup.exe** + binaires embarqués si requis (`drox.exe`, `Drox.exe`) |
| W1-3 | Timestamp RFC 3161 | Horodatage pour validité après expiration certificat |
| W1-4 | CI / secrets | Certificat en secret GitHub ou signature manuelle locale documentée |
| W1-5 | Doc utilisateur + OR README | Retirer ou nuancer l’avertissement SmartScreen · [GUIDE-PUBLICATION-WIN32.md](../../operations/GUIDE-PUBLICATION-WIN32.md) |
| W1-6 | Smoke install Windows frais | Machine / VM sans exception préalable · vérifier absence bannière « Éditeur inconnu » (ou réputation acquise) |

**Références** : `build-release-win32.ps1` (`Add-WindowsSdkSignToolToPath`) · [RULES.md § Installeur](../../../../RULES.md) · [GUIDE WIN32 § Authenticode](../../operations/GUIDE-PUBLICATION-WIN32.md).

**Critère** : installeur `v1.5.4` publié sur OR avec signature Authenticode valide ; install testée sans contournement manuel SmartScreen.

### Critères d'acceptation

- [ ] `latest.json` : **win32-x64** + **linux-x64** même `version`
- [ ] `.deb` installable sans Rust préinstallé
- [ ] Moteur embarqué TUI 1.5+ (`tui_mono`)
- [ ] Installeur Windows **signé** (W1) ou décision documentée si reporté

---

## Pipeline

```mermaid
flowchart LR
  subgraph LIN["Linux"]
    B["build-release-linux.sh"]
    P["release-publish-linux.sh"]
  end
  subgraph WIN["Windows W1"]
    S["sign-drox-win32.ps1"]
  end
  M["stable/latest.json"]
  R["gh release v1.5.4"]
  B --> P --> M
  S --> M
  M --> R
```

---

## Commandes

```bash
export DROX_PRODUCT_SURFACE=release
./scripts/build-release-linux.sh
./scripts/release-publish-linux.sh
gh release upload v1.5.4 ../Drox---IDE---OR/_upload/Drox-IDE-1.5.4-linux-x64.deb --repo DroxKiwi/Drox---IDE---OR
```

Depuis Windows (WSL) : `.\scripts\wsl-linux-build.ps1`

CI : **Actions → Drox Linux release build → Run workflow**

---

## Liens

- [README 1.5.4](README.md)
- [PLAN 1.5.3](../1.5.3/PLAN-1.5.3.md)
- [PLAN 1.5.1b](../1.5.1b/PLAN-1.5.1b.md) — préparation scripts
- [GUIDE publication Linux](../../operations/GUIDE-PUBLICATION-LINUX.md)
