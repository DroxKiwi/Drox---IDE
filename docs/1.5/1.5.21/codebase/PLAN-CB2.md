# Plan CB2 — Embed (llama.cpp) + hybrid retrieval

**Parent** : [PLAN-EMBED-PACKAGING.md](PLAN-EMBED-PACKAGING.md) · [PLAN-CB1.md](PLAN-CB1.md)  
**Code** : `drox-engine/drox/crates/drox-embed` · `contrib/drox/common/codebase/`

## Objectif

1. Runtime embed dans `drox.exe` (feature Cargo `embed`)  
2. RPC `embed.status` / `embed.encode`  
3. Vecteurs persistés à côté des chunks (`vectors.json`)  
4. Recherche **hybride** (lexical + cosine)  
5. Cockpit : statut embed + probe hybrid  

## Build

```text
# Dev moteur avec embed
# Windows: LIBCLANG_PATH=...\LLVM\bin  + cmake on PATH (VS BuildTools CMake OK)
cargo build -p drox-cli --features embed
# Modèle
pwsh scripts/fetch-drox-embed-model.ps1
```

Sans feature : `embed.status.built = false` — IDE reste en lexical-only (CB1).

## IDE (CB2)

- Reindex : chunks + encode batch via RPC si `built` + GGUF résolu  
- Probe cockpit : hybrid merge si `vectors.json` présent  
- Resolve modèle : `DROX_EMBED_MODEL_PATH` → userData → resources → `drox-engine/models/`

## Dev Windows (pièges connus)

- `LIBCLANG_PATH` → NuGet `libclang.runtime.win-x64` (voir `scripts/build-drox-embed.ps1`)
- `CARGO_TARGET_DIR=C:\t\drox` évite MAX_PATH sous le cache sandbox
- `GGML_CPU_REPACK=OFF` + `with_use_mmap(false)` sur le load modèle
- `load_model` ne doit **pas** appeler `status()` sous le mutex `LOADED` (deadlock)
- Test dogfood : `cargo test -p drox-embed --features embed --test live_minilm -- --ignored --nocapture`

## Modèle défaut

`all-MiniLM-L6-v2` GGUF Q4/Q5 (~20–45 Mo) — chemin via resolve (env / userData / resources / repo `drox-engine/models/`).

## Suite

**CB2b** — auto-index type Cursor → [PLAN-CB2b.md](PLAN-CB2b.md)  
Puis **CB2c** — découpage lisible → [PLAN-CB2c.md](PLAN-CB2c.md) · **avant** le tool agent CB3.
