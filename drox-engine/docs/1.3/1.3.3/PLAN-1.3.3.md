# Plan 1.3.3 — Stabilisation moteur & release fiable

**Version** : 1.3.3 · juin 2026  
**Base** : moteur 1.3.2 mergé (`role_split` — [CONDUCTEUR-CODE.md](../1.3.2/CONDUCTEUR-CODE.md))

---

## Objectif release

| Priorité | Livrable |
|----------|----------|
| **P0** | Installeur **1.3.3** = code `main` / branche `1.3.3` (rebuild `-ForceCompile`) |
| **P0** | MAJ in-app testée (install ≤1.3.2 → notif → 1.3.3) |
| **P0** | TEST-PLAN 1.3.2 exécuté et signé |
| **P1** | Presets `relaxed` / `normal` / `strict` validés post-refacto |
| **P1** | `cargo test -p drox-engine` vert en CI locale |

**Hors scope immédiat** : index RAG, graphe contexte, fast path complétion — voir [backlog](#backlog-post-stabilisation).

---

## Phase S — Stabilisation (cette release)

### S.1 Tests manuels moteur

Reprendre [TEST-PLAN-1.3.2.md](../1.3.2/finalisation/TEST-PLAN-1.3.2.md) :

- T1–T4 routage (pas de gate chain dans l’export)
- T5–T8 tool gates
- T9–T10 sub-agents / scope

Critère : export transcript sans artefacts `GATE · probe` / `architect_intent`.

### S.2 Presets & réglages IDE

[VALIDATION-PRESETS-ENGINE-1.3.2.md](../1.3.2/finalisation/VALIDATION-PRESETS-ENGINE-1.3.2.md) — P8–P13.

### S.3 Tests automatisés

```powershell
cd drox-engine\drox
cargo test -p drox-engine
npm run test-node -- --run "vs/workbench/contrib/drox/test/common/"
```

### S.4 Package & MAJ

```powershell
# Rebuild obligatoire — ne pas réutiliser out-vscode-min obsolète
.\scripts\build-release-win32.ps1 -SkipNpmInstall -ForceCompile -WithSetup
npm run drox:publish   # ou drox:ship si build déjà fait
# Puis Release GitHub + latest.json sur Drox---IDE---OR
```

Vérifier **À propos** → `droxVersion` **1.3.3** dans l’exe installé.

### S.5 Régression IDE (1.3.2 livré)

| # | Scénario |
|---|----------|
| H1–H3 | Session lazy L2 ([PLAN-CHARGEMENT-SESSION](../1.3.2/finalisation/PLAN-CHARGEMENT-SESSION-LAZY-1.3.2.md)) |
| D1 | Agents MS off, Drox Chat OK |
| D1.3–D1.5 | Welcome, Aide, télémétrie off |

---

## Critère « 1.3.3 livrée »

- [ ] Binaire installé = features 1.3.2+ (pas de bundle stale)
- [ ] MAJ depuis install précédente fonctionne
- [ ] TEST-PLAN + presets OK
- [ ] `cargo test` vert
- [ ] [CLOSURE-1.3.3.md](finalisation/CLOSURE-1.3.3.md) signée

---

## Backlog (post-stabilisation)

>Ancien plan « 3 piliers » — **reporté** après tag 1.3.3 stable.

| Pilier | Résumé | Référence |
|--------|--------|-----------|
| Index local | ~5 fichiers pertinents au curseur | feature-brainstorm / 1.3.3 draft |
| Graphe contexte | imports, callers, tests condensés | idem |
| Fast path | complétion locale basse latence | idem |
| Benchmark hardware | presets par modèle / PC | [fiche 12](../../feature-brainstorm/12-presets-globaux-benchmark-hardware.md) |

---

## Liens

- [README 1.3.3](README.md)
- [CLOSURE](finalisation/CLOSURE-1.3.3.md)
- [Hub 1.3](../README.md)
