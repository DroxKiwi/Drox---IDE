# 03 — Release Windows

Publication **officielle** → repo **`<OR>`** (pas les sources).

Ordre multi-plateforme : **Windows avant Linux**.

---

## 1. Préparer

```powershell
cd <REPO>
# branche validée : main, <BRANCH>, ou integrate/*
```

Vérifier `package.json` : `droxVersion` = `<DROX_VER>`.

Smoke chat OK (voir [01-BRANCHE.md](01-BRANCHE.md) §3).

---

## 2. Build + manifeste OR

```powershell
npm run drox:ship
```

| Variante | Commande |
|----------|----------|
| 1er build machine / nouvelle icône exe | `npm run drox:ship -- -Full` |
| Modif `contrib/drox` ou post-upstream | `npm run drox:ship -- -Force` |
| Re-package sans recompiler TS | `npm run drox:ship -- -Fast` |

**Sorties**

| Fichier | Chemin |
|---------|--------|
| Installeur | `.build\win32-x64\user-setup\Drox-IDE-UserSetup-*.exe` |
| Copie upload | `<OR>\_upload\Drox-IDE-Setup-<DROX_VER>-win32-x64.exe` |
| Manifeste | `<OR>\stable\latest.json` (win32-x64) |

Installeur seul (sans manifeste) : `npm run drox:build`

---

## 3. Commit manifeste OR

```powershell
cd <OR>
git add stable/ .gitignore NOTICE.md README.md
git status   # aucun .exe ne doit apparaître
git commit -m "Release v<DROX_VER> win32-x64 (manifest)."
git push origin main
```

---

## 4. GitHub Release (binaire)

```powershell
cd <OR>
gh release create <TAG> `
  ".\_upload\Drox-IDE-Setup-<DROX_VER>-win32-x64.exe" `
  --repo DroxKiwi/Drox---IDE---OR `
  --title "Drox IDE <DROX_VER>" `
  --notes-file ".\stable\<DROX_VER>\RELEASE_NOTES.md"
```

Release déjà créée :

```powershell
gh release upload <TAG> ".\_upload\Drox-IDE-Setup-<DROX_VER>-win32-x64.exe" --repo DroxKiwi/Drox---IDE---OR
```

---

## 5. Suite

→ [04-RELEASE-LINUX.md](04-RELEASE-LINUX.md)

---

## Problèmes

| Symptôme | Action |
|----------|--------|
| Bundle stale / `-Fast` refusé | `npm run drox:ship -- -Force` |
| Inno Setup introuvable | `.\scripts\ensure-inno-setup.ps1` |
| SmartScreen « éditeur inconnu » | Normal (non signé Authenticode) |
| `LICENSE-INSTALL.txt` manquant | `git checkout main -- LICENSE-INSTALL.txt logo3.png` |
| OR introuvable | Cloner `Drox---IDE---OR` au même niveau que `<REPO>` |
