# Drox 1.3.2 — Moteur stabilisé

**Statut** : **tests & clôture** (juin 2026)  
**Branche** : `1.3.2`  
**Prérequis** : [1.3.1](../1.3.1/README.md)

---

## En une phrase

On **coupe le bruit** (gate chain TOML, paliers `E-*`, backpack, tours intent) et on **valide** un moteur simple : architecte + prompts + tool gates + sub-agents.

---

## Livré côté moteur

| Élément | Détail |
|---------|--------|
| Routage | RPC `architectInteractionMode` ou défaut **edit** |
| Prompt edit | `01_core.md` + tous les `T-*` au boot |
| Workflow | Choix du **modèle** (pas de palier moteur) |
| Garde-fous | `architect_gates.rs` + `gates.rs` (tool gates + clôture) |
| Retiré | `GateEngine`, `EditTier`, backpack, `architect_intent`, events `GateProbe`… |

**Carte code** : [CONDUCTEUR-CODE.md](CONDUCTEUR-CODE.md)  
**Docs obsolètes** : [gates/ARCHIVE.md](gates/ARCHIVE.md)

---

## Prochaine étape : **tester & fiabiliser**

| Doc | Rôle |
|-----|------|
| [TEST-PLAN-1.3.2.md](finalisation/TEST-PLAN-1.3.2.md) | Scénarios Salut, discuss/edit, export sans `GATE · probe` |
| [VALIDATION-PRESETS-ENGINE-1.3.2.md](finalisation/VALIDATION-PRESETS-ENGINE-1.3.2.md) | **Presets** `relaxed` / `normal` / `strict` — pertinence des paramètres IDE après refacto |
| [CLOSURE-1.3.2.md](finalisation/CLOSURE-1.3.2.md) | Checklist release |

Checklist release : [finalisation/CLOSURE-1.3.2.md](finalisation/CLOSURE-1.3.2.md)

---

## Suite

- **1.3.3** — release fiable (pipeline, package aligné) → [../1.3.3/README.md](../1.3.3/README.md)
- **1.3.4** — stabilisation moteur (tests) → [../1.3.4/README.md](../1.3.4/README.md)
- **1.4.1** — index / graphe / fast path → [../../1.4/1.4.1/README.md](../../1.4/1.4.1/README.md)

Anciens axes 1.3.2 (sessions segmentées, dé-brand, télémétrie, prompts par palier…) : **hors périmètre** cette release — voir CLOSURE § « exclu ».

---

## Docs utiles (à jour)

| Doc | Rôle |
|-----|------|
| [CONDUCTEUR-CODE.md](CONDUCTEUR-CODE.md) | Architecture actuelle |
| [PROTOCOL-CONTRACT.md](PROTOCOL-CONTRACT.md) | Protocole UI (partiellement à réviser) |
| [PATCHNOTES-1.3.2.md](PATCHNOTES-1.3.2.md) | Notes release |
| [JOURNAL-1.3.2.md](JOURNAL-1.3.2.md) | Journal dev |

## Docs historiques (ne pas suivre)

Plans gates, backpack, paliers `E-*`, circuit gate chain → [gates/ARCHIVE.md](gates/ARCHIVE.md)

---

## Versionning

```json
"droxVersion": "1.3.2"
```

Build : [GUIDE-PUBLICATION-WIN32.md](../../operations/GUIDE-PUBLICATION-WIN32.md)
