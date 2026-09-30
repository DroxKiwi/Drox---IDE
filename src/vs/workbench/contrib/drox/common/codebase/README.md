# Drox `@Codebase` — domaine commun

**Docs produit / tech** : [`docs/1.5/1.5.21/codebase/`](../../../../../../../docs/1.5/1.5.21/codebase/README.md)

| Fichier | Rôle |
|---------|------|
| `droxCodebasePaths.ts` | Racine index `{workspace}/.drox/codebase-index/` |
| `droxCodebaseIgnore.ts` | Dossiers / fichiers exclus |
| `droxCodebaseChunker.ts` | Fenêtres de lignes → chunks |
| `droxCodebaseLexicalSearch.ts` | Recherche lexicale CB1 |
| `droxCodebaseJsonStore.ts` | `manifest.json` + `chunks.json` |
| `droxCodebaseTypes.ts` | Snapshot cockpit, hits, états |
| `droxCodebaseIndexService.ts` | Contrat index / search |
| `droxCodebaseIndexServiceImpl.ts` | Scan + store (CB1) |
| `droxCodebaseSupervisionService.ts` | Live status + actions cockpit |

UI : [`browser/codebase/`](../../browser/codebase/README.md)
