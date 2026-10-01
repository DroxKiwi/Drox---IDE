# Plan CB2b — Auto-index (type Cursor)

**Parent** : [PLAN-CB2.md](PLAN-CB2.md) · [ARCHITECTURE.md](ARCHITECTURE.md) §9  
**Suite** : [CB3 — tool agent](ARCHITECTURE.md) (après cette phase)  
**Code** : `contrib/drox/common/codebase/` · supervision / index service

**Statut** : 📋 **prochaine étape** · **avant CB3**

## Pourquoi avant CB3

Sans fraîcheur automatique, le tool agent (CB3) cherchera dans un index **vide ou périmé**.  
Chez Cursor, ce n’est **pas** le modèle qui déclenche l’index : un **service IDE** le tient à jour ; le LLM ne fait qu’appeler un outil dessus.

## Objectif

Comportement « zero-click » pour l’utilisateur :

1. **Ouverture** d’un dossier workspace → `ensureIndexed` (ou sync) en arrière-plan  
2. **Éditions / saves** → invalidation **incrémentale** (hash contenu, debounce) + re-chunk / re-embed des paths touchés  
3. **Reindex manuel** reste dans le cockpit (secours / debug) — **pas** le chemin nominal  
4. État exposé (`idle` / `indexing` / `stale` / `error`) pour la pastille UI CB3  

## Hors scope CB2b

- Bouton Reindex dans l’input chat (éviter ; préférer pastille + cockpit)  
- Tool agent / `@Codebase` → **CB3 / CB4**  
- Catalogue admin delete/compact → **CB3b**

## Livrables techniques

| # | Livrable |
|---|----------|
| 1 | Hook workspace : au `folders[0]` (et changement de racine) → indexation idle en background |
| 2 | File watcher / `onDidSave` (debounce ~300–800 ms) → upsert path(s) seulement |
| 3 | Skip si `contentHash` inchangé (déjà prévu archi) |
| 4 | File d’index **une** par racine ; pas de rebuild full sauf Purge / Reindex forcé / changement modèle embed |
| 5 | Respect ignore (`.gitignore` / règles Drox) + soft cap fichiers |
| 6 | Snapshot cockpit à jour pendant l’auto-index (sans alerte stale embed) |

## Critères d’acceptation

1. Ouvrir un repo sans cliquer Reindex → au bout de quelques secondes, cockpit montre files/chunks/(vectors si embed).  
2. Modifier un fichier indexé → après debounce, ce path est à jour ; le reste de l’index inchangé.  
3. Pas de freeze UI (travail en background / batches).  
4. Reindex cockpit force toujours un rebuild cohérent.

## Ordre dans 1.5.21 `@Codebase`

```text
CB0 → CB1 → CB2 → CB2b (auto-index) → CB3 (tool + pastille) → CB3b / CB4…
```
