# Clôture 1.5.0 — Moteur TUI + shim IDE

**Date** : juin 2026  
**Version** : `droxVersion` **1.5.0**  
**Branche** : `1.5.0`  
**Statut** : **moteur + dogfood livrés** · merge upstream VS Code **documenté** (Phase 5.8–5.9 à rejouer sur branche dédiée)

---

## Périmètre livré

| # | Livrable | Statut |
|---|----------|--------|
| **R-REPLACE** | Workspace `drox-engine/drox` = moteur TUI (plus de rail 1.4) | ✅ `6b1a97b` |
| **R-RPC-IDE** | `drox --serve` : `initialize`, `agent.run`, `tool/exec`, `user/ask`, sessions | ✅ |
| **R-ENGINE-FOLLOW-IDE** | Params vignettes → `LlmConfig` + `PermissionMode` ; events shim rail | ✅ |
| **R-VIGNETTES** | Configuration + Architecte + modes permission conservés | ✅ |
| **Shim events** | `ide_event_shim.rs` + [SHIM-MOTEUR-IDE.md](SHIM-MOTEUR-IDE.md) | ✅ |
| **Package** | `package-drox.ps1` → `resources/drox/win32-x64/drox.exe` | ✅ |
| **Dogfood** | 3 scénarios `site-kdds` (Qwen 27B) — voir [chat_qwen27b.txt](../../chat_qwen27b.txt) | ✅ |

### Dogfood validé (session `ses_ce0848c3…`)

| Run | Demande | Résultat |
|-----|---------|----------|
| 1 | Salut | Q&A direct, phases OK |
| 2 | Analyser le projet | Exploration `file_read`, rapport structuré |
| 3 | README uniquement FR | `todo_write` → `file_write` `applied: true`, `phase: done` |

**Diagnostic export** : 16 tool calls, 1 erreur (bash sans plan au run 2), phase finale `done`.

---

## Tests automatisés (juin 2026)

| Suite | Résultat |
|-------|----------|
| `cargo test -p drox-cli` | ✅ 50 tests (shim RPC, `RemoteTool`, serde) |
| `cargo test --workspace` (moteur) | ✅ validé Phase 1 |

---

## Hors scope livré (reporté)

| Axe | Décision | Suite |
|-----|----------|-------|
| Authenticode Windows | Reporté | [1.5.1](../1.5.1/README.md) |
| Index / graphe | Reporté | [1.5.2](../1.5.2/README.md) |
| Profils sampling YAML | Reporté | [1.5.3](../1.5.3/README.md) |
| Refonte timeline / `droxChatAgentEvents` | Hors scope | Chantiers ultérieurs |
| Rail observateur / orchestration 1.4 | **Abandonné** | Archivé `docs/1.4/` |

---

## UI — retrait minimal (3.7)

| Élément | Verdict |
|---------|---------|
| Vignette **Executor** | Absente du composer (HTML) |
| Vignettes **Config** + **Architecte** | Conservées |
| CSS / replay orchestration legacy | Toléré (affichage passif si events anciens) |
| Champs RPC `orchestrationMode` / `architectInteractionMode` | Encore envoyés par l’IDE, **ignorés** par le moteur |

---

## Release produit (5.6 / 2.2)

- [x] `package.json` → `droxVersion` **1.5.0**
- [ ] `npm run drox:ship` + `drox-bundle-stamp.json` aligné (à rejouer au publish installeur)
- [ ] Tag git `v1.5.0` + release OR

---

## Rattrapage upstream VS Code (5.7–5.9)

Audit **juin 2026** (branche `1.5.0` vs `upstream/main`) :

| Métrique | Valeur |
|----------|--------|
| Base fork | VS Code **1.122.0** (`package.json` `version`) |
| `upstream/main` HEAD | `43e100f3` (2026-06-20) |
| Commits **en avance** sur merge-base | ~47 (couche Drox) |
| Commits **en retard** sur `upstream/main` | ~159 617 |

**Décision** : ne pas mélanger le merge upstream avec le chantier shim moteur (conforme au plan). Prochaine étape :

1. Branche `integrate/vscode-1.1xx` depuis `1.5.0` mergée
2. `git merge upstream/main` — résolution **ours** sur `contrib/drox`, `drox-engine`, `resources/drox`
3. Rejouer `list-nexus-patches.ps1` · `npm run compile` · F5 · `cargo test --workspace`

Références : [ARCHITECTURE-DECOUPLAGE-UPSTREAM](../../1.2/steps/03-upstream/ARCHITECTURE-DECOUPLAGE-UPSTREAM.md) · [PATCHES-UPSTREAM-BUILD](../../1.3/1.3.0/finalisation/PATCHES-UPSTREAM-BUILD.md)

---

## Critères d’acceptation gate 1.5.0

| # | Critère | Statut |
|---|---------|--------|
| 1 | Plus de code rail 1.4 dans `drox-engine/drox` | ✅ |
| 2 | F5 / installeur lance moteur TUI | ✅ |
| 3 | Chat : vignettes + run sans crash RPC | ✅ |
| 4 | Mutations via `tool/exec` client | ✅ (`file_write` dogfood) |
| 5 | Dogfood 3 scénarios | ✅ |
| 6 | `drox-tui` buildable | ✅ (member workspace) |
| 7 | Merge upstream VS Code | ⏳ audit fait · merge sur branche dédiée |

---

## Journal

| Date | Événement |
|------|-----------|
| 2026-06 | Ouverture ligne 1.5 · plans 1.5.0–1.5.3 |
| 2026-06 | Phase 1 swap moteur TUI `6b1a97b` |
| 2026-06 | Phases 2–4 shim RPC + `ide_event_shim` `d96a0f6` |
| 2026-06 | Dogfood 3 scénarios `site-kdds` + export transcript |
| 2026-06 | `droxVersion` → 1.5.0 · clôture moteur |

---

## Liens

- [PLAN-1.5.0.md](PLAN-1.5.0.md)
- [SHIM-MOTEUR-IDE.md](SHIM-MOTEUR-IDE.md)
- [IMPACT-REMPLACEMENT.md](IMPACT-REMPLACEMENT.md)
- [Hub 1.5](../README.md)
