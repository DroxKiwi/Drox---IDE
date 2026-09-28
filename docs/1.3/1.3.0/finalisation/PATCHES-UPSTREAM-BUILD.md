# Patches fork — build release & merge upstream VS Code

**Date** : 2026-05-29  
**Usage** : checklist après chaque merge `upstream/main` (ou avant release F1).

---

## Fichiers modifiés hors `contrib/drox`

| Fichier | Pourquoi | Action au merge upstream |
|---------|----------|-------------------------|
| `build/next/index.ts` | Copie `contrib/drox/browser/media/**` dans `desktopResourcePatterns` | Réappliquer la ligne media Drox si le tableau est conflictuel |
| `build/gulpfile.vscode.ts` | `signtool` optionnel, filtre `.node` Copilot, `core-ci-desktop`, embarquement `resources/drox` | Résoudre conflits manuellement — relire § patchWin32 + `core-ci-desktop` |
| `build/lib/copilot.ts` | `shouldPatchPeFileForPlatform` (rcedit sans binaires Linux) | Réappliquer la fonction si fichier écrasé |
| `src/.../drox/common/droxExecutable.ts` | Résolution `installDir` + `resources/drox` ; ignore `drox.executablePath` = `drox` | Garder `enumerateDroxExecutableCandidates` |
| `src/.../drox/electron-main/droxExecutableMain.ts` | Repli `fs.existsSync` au spawn (build packagé) | Fichier fork |
| `src/.../drox/electron-main/droxEngineMainService.ts` | Résolution moteur avant `spawn` | Réappliquer bloc `resolveDroxExecutableOnDisk` |
| `scripts/build-release-win32.ps1` | Script F1 (propriété fork) | Aucun conflit upstream attendu |
| `scripts/sync-drox-win32-icons.ps1` | `logo3.ico` / `logo3.png` → `resources/win32/` | Propriété fork |
| `build/lib/electron.ts` | `winIcon` → `drox.ico` | Réappliquer si écrasé |
| `build/win32/code.iss` | `SetupIconFile` → `drox.ico` | Réappliquer si écrasé |
| `src/.../drox/browser/chat/droxChatGeneralSettings.ts` | Fix TS release | Conflit rare |
| `src/.../drox/common/droxSettingMigration.ts` | Types migration config | Conflit rare |

---

## Tâches gulp à connaître

| Tâche | Rôle |
|-------|------|
| `core-ci` | Build complet Microsoft (desktop + server + server-web en parallèle) |
| **`core-ci-desktop`** | **Drox release Windows** — seulement `out-vscode-min` |
| `compile-copilot-extension-build` | Requis avant `vscode-win32-x64-min-ci` en local |
| `vscode-win32-x64-min-ci` | Package `VSCode-win32-x64/` |

---

## Commande release (rappel)

```powershell
.\scripts\build-release-win32.ps1 -SkipNpmInstall -SkipElectron
```

Le script appelle `core-ci-desktop` si `out-vscode-min` est incomplet.

---

## Smoke post-merge / post-build

- [ ] `out-vscode-min/.../drox/browser/media/droxChatMvp.css` existe
- [ ] `VSCode-win32-x64/Drox IDE.exe` démarre
- [ ] Chat Drox : pas de rectangles blancs, run minimal OK
- [ ] `resources/drox/win32-x64/drox.exe` résolu (hors `resources/app/`)

---

## Liens

- [ARCHITECTURE-DECOUPLAGE-UPSTREAM.md](../1.2.0/steps/03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md)
- [PLAN-DISTRIBUTION-LAUNCHER.md](./PLAN-DISTRIBUTION-LAUNCHER.md)
