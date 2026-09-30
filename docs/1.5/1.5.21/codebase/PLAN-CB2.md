# Plan CB2 — Embed (llama.cpp) + hybrid retrieval

**Parent** : [PLAN-EMBED-PACKAGING.md](PLAN-EMBED-PACKAGING.md) · [PLAN-CB1.md](PLAN-CB1.md)  
**Code** : `drox-engine/drox/crates/drox-embed` · `contrib/drox/common/codebase/`

## Objectif

1. Runtime embed dans `drox.exe` (feature Cargo `embed`)  
2. RPC `embed.status` / `embed.encode`  
3. Vecteurs persistés à côté des chunks  
4. Recherche **hybride** (lexical + cosine)  
5. Cockpit : statut embed + probe hybrid  

## Build

```text
# Dev moteur avec embed
cargo build -p drox-cli --features embed
# Modèle
pwsh scripts/fetch-drox-embed-model.ps1
```

Sans feature : `embed.status.built = false` — IDE reste en lexical-only (CB1).

## Modèle défaut

`all-MiniLM-L6-v2` GGUF Q4/Q5 (~20–45 Mo) — chemin via resolve (env / userData / resources / repo `drox-engine/models/`).
