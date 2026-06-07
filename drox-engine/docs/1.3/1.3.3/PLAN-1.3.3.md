# Plan 1.3.3 — Release fiable (pipeline & package)

**Version** : 1.3.3 · juin 2026  
**Base** : code 1.3.2 sur `main` ([CONDUCTEUR-CODE.md](../1.3.2/CONDUCTEUR-CODE.md))

---

## Objectif release

| Priorité | Livrable |
|----------|----------|
| **P0** | Garde-fous build (`scripts/lib/drox-bundle-readiness.ps1`) — refuse bundle / package désalignés |
| **P0** | Installeur **1.3.3** = rebundle `-Force` (UI 1.3.2+ dans l’exe) |
| **P0** | `drox.exe` embarqué MODERN (`role_split`) |
| **P0** | MAJ in-app testée (`latest.json` → GitHub Release OR) |
| **P1** | Smoke manuel post-install (chat, lazy history, welcome, Aide Drox) |

**Hors scope 1.3.3** : TEST-PLAN T1–T10 signé → [1.3.4](../1.3.4/PLAN-1.3.4.md) · index / graphe → [1.3.5](../1.3.5/PLAN-1.3.5.md).

---

## Phase B — Build & package

### B.1 Garde-fous (livré code)

Module `scripts/lib/drox-bundle-readiness.ps1` :

- `drox-bundle-stamp.json` = `droxVersion` du `package.json`
- Sentinelles UI (lazy-history, core bootstrap, contributions D1.x)
- Rejet des artefacts monolithe (`00-context.js`, …)
- Fraîcheur sources `contrib/drox` + Rust vs bundle
- Vérif post-package : `product.json`, stamp, moteur MODERN
- `-Fast` et `drox:publish` bloqués si désaligné

### B.2 Build release

```powershell
npm run drox:ship -- -Force
```

Critères automatiques (échec = pas de ship) :

- [ ] `out-vscode-min/drox-bundle-stamp.json` → `1.3.3`
- [ ] Pas d’artefacts obsolètes dans le bundle
- [ ] `resources/app/product.json` → `droxVersion` **1.3.3**

### B.3 Smoke install

| # | Vérification |
|---|--------------|
| S1 | **À propos** → `1.3.3` |
| S2 | Chat : modules découpés (pas d’UI monolithe 1.3.1) |
| S3 | Session lazy L2 ([PLAN-CHARGEMENT-SESSION](../1.3.2/finalisation/PLAN-CHARGEMENT-SESSION-LAZY-1.3.2.md)) |
| S4 | Welcome Drox, menu Aide, télémétrie off (D1.x) |
| S5 | `.\scripts\verify-drox-engine.ps1` sur binaire installé → MODERN |

### B.4 Publication OR

1. `gh release create` avec le `.exe` rebuild
2. `latest.json` → **1.3.3**
3. Test MAJ depuis install 1.3.1 / 1.3.2 (sans `drox.update.simulateLatestVersion`)

---

## Critère « 1.3.3 livrée »

- [ ] Installeur = code `main` / 1.3.2 (UI + moteur alignés)
- [ ] Pipeline refuse un package stale (reproductible)
- [ ] MAJ in-app OK
- [ ] [CLOSURE-1.3.3.md](finalisation/CLOSURE-1.3.3.md) signée

---

## Suite

- **[1.3.4](../1.3.4/README.md)** — stabilisation moteur (tests, presets, cargo)
- **[1.3.5](../1.3.5/README.md)** — index, graphe, fast path

---

## Liens

- [README 1.3.3](README.md)
- [CLOSURE](finalisation/CLOSURE-1.3.3.md)
- [Hub 1.3](../README.md)
