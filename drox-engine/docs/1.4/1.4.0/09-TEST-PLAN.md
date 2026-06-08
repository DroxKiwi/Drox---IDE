# 09 — TEST-PLAN Run Rail 1.4.0

**Parent** : [README](README.md) · **Base** : [TEST-PLAN solo 1.3.4](../../1.3/1.3.4/finalisation/TEST-PLAN-1.3.4-SOLO.md)

---

## Prérequis

```powershell
cd drox-engine\drox
cargo test -p drox-engine run_rail::
.\scripts\verify-drox-engine.ps1
```

`engineTuning.runRailEnabled: true` (custom) ou preset post-CLOSURE.

---

## §1 Rail court (mode A)

| ID | Prompt | Stations attendues | Échec si |
|----|--------|-------------------|----------|
| R1 | « Salut » | INTENT → hold → ANSWER | `todo_write`, read > 0 |
| R2 | « Comment ça va ? » | idem R1 | mutation |
| R3 | « Résume le README » | READ → hold → ANSWER | `delegate`, plan |
| R4 | « Fix typo ligne 1 README » | READ → ACT → VERIFY → ANSWER | `todo_write` obligatoire |

---

## §2 Rail long (depth complex)

| ID | Prompt | Attendu |
|----|--------|---------|
| R5 | Charte CSS (message chat.txt) | PROPOSE sans mutation ; hold user |
| R6 | Après « oui » user | PLAN → ACT → VERIFY |
| R7 | Livrable | CSS valide, pas de script jetable racine |

---

## §3 Gates dures

| ID | Scénario | Attendu |
|----|----------|---------|
| R8 | `file_write` en station READ | Erreur pre_gate |
| R9 | `todo_write` en PROPOSE | Erreur ou nudge |
| R10 | `[phase: done]` sans VERIFY après mutation code | Gate testing refuse |

---

## §4 Segments

| ID | Scénario | Attendu |
|----|----------|---------|
| R11 | ACT gros fichier | `railSegmentStart` UI |
| R12 | 2× fail même path | Circuit breaker, message user |

---

## §5 UI blocs

| ID | Vérif |
|----|-------|
| R13 | Bloc « Exploration » repliable après READ |
| R14 | Pas de bloc PLAN si station non empruntée |
| R15 | Sous-bloc segment dans ACT |

---

## §6 Régression 1.3.4

| ID | `runRailEnabled: false` |
|----|-------------------------|
| R16 | T1–T4 TEST-PLAN solo inchangés |
| R17 | discuss/analyze RPC inchangés |

---

## §7 Dogfood

| ID | Description |
|----|-------------|
| D1 | Rejouer 3 messages `chat.txt` — run < 100 steps, CSS OK |
| D2 | Session multi-tour réelle 30 min sans abort boucle |
| D3 | Modèle fort (même que dogfood actuel) |

---

## Sign-off CLOSURE 1.4

- [ ] R1–R17 pass
- [ ] D1–D3 pass
- [ ] `cargo test -p drox-engine` vert
- [ ] Doc 01–08 à jour avec écarts constatés
