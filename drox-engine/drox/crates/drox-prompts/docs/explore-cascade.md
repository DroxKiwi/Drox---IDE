# Cascade Explore — carte visuelle

L’arborescence **`src/explore/cascade/`** *est* le plan. Chaque `mod.rs` = interface d’étape (`CascadeStage`).

```text
explore/cascade/
├── execution/                      depth 1 — tools ON
│   ├── mod.rs                      → EXPLORE_SYSTEM_ENTRY
│   └── commit/                     depth 2 — explore_commit (canal tools)
│       └── mod.rs                  → COMMIT_STAGE_ENTRY
└── materialize/                    depth 1 — assemble (+ fill legacy)
    ├── mod.rs                      → bridge EXPLORE_REPORT_SYSTEM_ENTRY (legacy)
    ├── fill/                       depth 2 — fallback JSON (non nominal)
    │   ├── mod.rs                  → FILL_KIND_SYSTEM_ENTRY + FillKindStage
    │   └── <kind>/mod.rs
    └── assemble/mod.rs             depth 2 — 0 LLM (glue artefacts)
```

## Flux nominal (Option A)

1. **execution** — tools lecture + **`explore_commit`** progressif  
2. **L0** — `paths_read` dérivé des tool traces (0 LLM) si non commité  
3. **assemble** — écrit `.md` / manifest depuis le handle ; kinds absents → `kinds_incomplete`

## État

| Couche | Statut |
|--------|--------|
| Interfaces + prompts commit | ✅ ce crate |
| Runner moteur (`explore_executor` phase1 + assemble) | ✅ commits + L0 |
| fill JSON prose | legacy / non nominal |
