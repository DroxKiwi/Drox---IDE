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

Profils PowerShell :

```powershell
# Dogfood — aligne le snapshot sur le binaire debug (rapide, stamp dev OK)
.\scripts\package-drox.ps1 -Profile debug

# Ship / installateur — release + DROX_OMIT_DEV_BUILD=1
.\scripts\package-drox.ps1 -Profile release
# équivalent npm (release) :
npm run package-drox
```

## Hygiène dogfood (deux rôles)

Il peut coexister plusieurs `drox.exe` sur disque (`target/debug`, `target/release`, `resources/…`, `deps/`). **Deux rôles seulement** comptent :

| Rôle | Chemin | Source de vérité |
|------|--------|------------------|
| **Dogfood / F5** | `drox-engine/drox/target/debug/drox.exe` | Après chaque lot moteur : `cargo build -p drox-cli` dans `drox-engine/drox` |
| **Snapshot embarqué** | `resources/drox/<plateforme>/drox[.exe]` | Resync via `package-drox` — **ne pas** écraser / supprimer à la main |

Habitudes :

1. Lot moteur → rebuild **debug**.
2. Avant dogfood sensible ou workspace **externe** → `package-drox.ps1 -Profile debug` (évite un `resources/` périmé si le probe tombe dessus).
3. Avant ship → `package-drox` **release**.
4. `target/*/deps/drox.exe` = artefact Cargo (pas le process spawné) — ignorer.
5. Ne pas laisser `drox.executablePath` = `drox` nu (court-circuite mal) ; chemin absolu vers `target/debug` seulement si besoin de forcer.

Vérif rapide après resync : même taille / même hash entre `target/debug/drox.exe` et `resources/drox/<plateforme>/drox.exe`.

## Résolution au runtime

L’IDE cherche le binaire dans cet ordre (voir `droxExecutable.ts`) :

1. `drox.executablePath` si défini (chemin absolu existant)
2. `drox-engine/drox/target/{debug,release}/` dans le **workspace** ouvert
3. `drox-engine/drox/target/{debug,release}/` sous **appRoot** (dev F5 — **avant** le snapshot packagé)
4. `resources/drox/<plateforme>/drox[.exe]` sous `appRoot` / installDir (snapshot — **périmé** si non resync)
5. `drox` sur le `PATH`

En dogfood F5 avec le repo IDE, l’étape 3 privilégie `target/debug`. Le resync `package-drox -Profile debug` garde l’étape 4 alignée pour les cas hors-repo / probe dégradé.

## Git

Les binaires compilés sont **ignorés** par `.gitignore`. En CI, produisez-les avant `gulp vscode-win32-x64` (ou équivalent) ou publiez-les comme artifacts.
