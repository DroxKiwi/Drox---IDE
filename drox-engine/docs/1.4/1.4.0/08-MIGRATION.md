# 08 — Migration depuis 1.3.4 / 1.3.2

**Parent** : [README](README.md)

---

## Ce qu’on conserve

| Élément | Fichier | Rôle post-1.4.0 |
|---------|---------|------------------|
| `role_split` pipeline | `orchestration_run.rs` | Inchangé |
| RPC discuss/analyze/edit | `architect_gate.rs` | Boot rail raccourci ou complet |
| `[phase: …]` | `phases.rs` | Orthogonal au rail |
| Gates clôture | `gates.rs` | Station ANSWER |
| `ArchitectRunState` | `architect_state.rs` | Orchestration + todos ; rail en parallèle |
| `orchestration_delegate.rs` | segments ACT | Mécanisme réutilisé |
| Anti-boucle | `loop_intervention.rs` | Strikes aussi dans `RunRailState` |
| `looks_like_light_conversation` | `start_run.rs` | Défaut discuss ; pas substitut au rail edit |

---

## Ce qu’on déprécie (pas supprimer jour 1)

| Élément | Statut 1.4 |
|---------|------------|
| `01_core_solo.md` | Remplacé par `01_core_rail.md` si flag on |
| `delegate_executor` outil visible | Reste masqué ; segments internes |
| `ArchitectWorkMode` discovery/task | Fusionné dans `depth` + stations |
| Heuristique seule « salut → discuss » | Conservée discuss ; edit utilise rail |

---

## Ce qu’on ne ressuscite pas

Voir [gates/ARCHIVE.md](../../1.3/1.3.2/gates/ARCHIVE.md) :

- `GateEngine`, TOML, `EditTier`
- Tour `architect_intent` obligatoire
- Backpack, context bubbles

---

## Mapping conceptuel ancien → rail

| Ancien (1.2) | Run rail 1.4 |
|--------------|--------------|
| Plan → Delegate → Verify | PLAN → ACT (segment) → VERIFY |
| Sub-agent executor | Segment execute chapeau |
| Gate monolith reads | Strike READ dans `RunRailState` |
| Intent tour unique | hold/advance à **chaque** frontière |
| `architect_discuss` | Rail INTENT→READ?→ANSWER |

---

## Flag de migration

```json
{
  "engineStrictness": "custom",
  "engineTuning": {
    "runRailEnabled": true
  }
}
```

Défaut **false** jusqu’à Phase 4. Presets `relaxed` / `normal` / `strict` : activer après CLOSURE.

---

## Ordre de merge recommandé

1. Phase 0 squelette (flag off)
2. Phase 1 + tests + doc 03 si tableau change
3. Phase 2 dogfood charte
4. Phase 3 segments
5. Phase 4 UI + flip preset

Chaque PR : **une phase**, pas deux.
