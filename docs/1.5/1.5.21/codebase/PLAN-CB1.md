# Plan CB1 — Store lexical + cockpit branché

**Parent** : [README hub](README.md) · [AMBITION](AMBITION.md) · [PLAN-COCKPIT](PLAN-COCKPIT.md)  
**Code** : `src/vs/workbench/contrib/drox/{common,browser}/codebase/`

## Objectif

Premier code utile **sans** llama.cpp :

1. Racine instance = path workspace canonique → dossier `.drox/codebase-index/`  
2. Store metadata (SQLite ou JSON borné — trancher en impl.) + chunker lexical  
3. File d’indexation + compteurs  
4. Cockpit sidebar branché sur `IDroxCodebaseSupervisionService` (probe lexical)  
5. Badge embed = « non chargé » jusqu’à CB2  

## Statut CB1

- ✅ Store JSON lexical (`chunks.json` + `manifest.json`)  
- ✅ Chunker fenêtres + ignore  
- ✅ Search lexical + probe cockpit  
- ✅ Purge / Reindex  
- 🔲 Host Agents / panel (peut suivre CB2b / CB3)  

**Index incrémental** (invalidate path, watcher) → **[PLAN-CB2b.md](PLAN-CB2b.md)** (après embed hybrid, **avant** tool agent).

Embed → CB2 ([PLAN-CB2.md](PLAN-CB2.md) · [PLAN-EMBED-PACKAGING](PLAN-EMBED-PACKAGING.md)).  
Suite : CB2b → CB3.
