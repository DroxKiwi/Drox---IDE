# Binaire Drox embarqué (Drox IDE)

Le moteur Drox est livré ici pour les **installations packagées**, sans que l’utilisateur final installe Rust.

## Structure

```
resources/drox/
  README.md
  models/
    all-MiniLM-L6-v2.Q4_K_M.gguf   # défaut embed (copié par package-drox ; gitignored)
  win32-x64/drox.exe
  ...
```

`package-drox` copie aussi le MiniLM GGUF depuis `drox-engine/models/` vers `resources/drox/models/` (asset **inhérent** à l’app — pas de download utilisateur).

## Construire et copier (développeur / CI)

Depuis la racine du fork :

```powershell
# Windows (PowerShell)
.\scripts\package-drox.ps1
```

```bash
# macOS / Linux
./scripts/package-drox.sh
```

```bash
npm run package-drox
```

Cela exécute `cargo build --release -p drox-cli` dans `drox-engine/drox/` et copie le binaire vers `resources/drox/<plateforme-hôte>/`.

## Résolution au runtime

L’IDE cherche le binaire dans cet ordre (voir `droxExecutable.ts`) :

1. `drox.executablePath` si défini (chemin absolu existant)
2. `drox-engine/drox/target/{debug,release}/` dans le **workspace** ouvert
3. `drox-engine/drox/target/{debug,release}/` sous **appRoot** (dev F5 — avant le snapshot packagé)
4. `resources/drox/<plateforme>/drox[.exe]` sous `appRoot` / installDir (snapshot — peut être **périmé** en dev)
5. `drox` sur le `PATH`

En dogfood sur un projet externe (ex. `site-kdds`), l’étape 3 évite de prendre le binaire embarqué obsolète.

## Git

Les binaires compilés sont **ignorés** par `.gitignore`. En CI, produisez-les avant `gulp vscode-win32-x64` (ou équivalent) ou publiez-les comme artifacts.
