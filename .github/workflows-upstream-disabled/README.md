# Workflows upstream désactivés (Phase A — fork Drox)

Ces fichiers viennent de **Code OSS / microsoft/vscode**. Ils ne tournent **pas** sur `DroxKiwi/Drox---IDE` :

- runners **self-hosted 1ES** Microsoft (indisponibles sur le fork) ;
- `npm ci` Linux cassé tant que `@typescript/native-preview-win32-x64` est une dépendance hard (Phase B éventuelle).

Ils sont **conservés** ici pour fusion upstream et réactivation future. GitHub Actions ne charge que `.github/workflows/`.

## Actif sur le fork

| Workflow | Rôle |
|----------|------|
| [../workflows/drox-release-linux.yml](../workflows/drox-release-linux.yml) | Build `.deb` Linux (manuel / tag) |

## Réactiver un workflow

```powershell
git mv .github/workflows-upstream-disabled/<fichier>.yml .github/workflows/
```

Puis éventuellement corriger le lockfile (Phase B) avant de le laisser tourner sur `ubuntu-latest`.
