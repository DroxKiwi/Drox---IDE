# Plan 1.5.18 — Stabilité chat + stop/edit à la Cursor

**Version** : 1.5.18 · **Priorité** : P0 bugs, puis P1 feature UX  
**Surfaces** : fenêtre **Agents** + chat natif **IDE**

## Périmètre

| # | Type | Sujet | Statut |
|---|------|--------|--------|
| A | Bug | Agents — pas de reprise au redémarrage | ✅ S1–S3 |
| B | Bug | IDE — « Loading session… » bloqué | ✅ S0 |
| C | Feature | Stop / restore / edit (Cursor) | ✅ F1a–c |

**Docs** :
- [IMPLEMENTATION-S0-S3.md](IMPLEMENTATION-S0-S3.md)
- [IMPLEMENTATION-F1-STOP-EDIT.md](IMPLEMENTATION-F1-STOP-EDIT.md)

---

# Partie 1 — Bugs (S0–S3) ✅

| ID | Cause | Fix | Statut |
|----|-------|-----|--------|
| R1 | Layout `w{windowId}` volatile | S1 — `.last` | ✅ |
| R2 | Workspace pas prêt → MRU écrasé | S2 | ✅ |
| R3 | Natif ne persiste pas le layout | S3 | ✅ |
| R5 | Race `waitForContentProvider` | S0b | ✅ |
| R6 | Pas de workspace path en IDE | S0a | ✅ |
| — | Overlay sans timeout | S0c | ✅ |

---

# Partie 2 — Feature C ✅

| Item | Statut |
|------|--------|
| F1a — stop pré-réponse → restore input | ✅ |
| F1b — stop mid → keep display | ✅ |
| F1c — edit + Keep / Discard | ✅ |

---

## Plan d’exécution

| Phase | Item | Statut |
|-------|------|--------|
| 0–3 | S0–S3 | ✅ |
| 4 | Smoke bugs terrain | ⏳ |
| 5–7 | F1a–c | ✅ |
| 8 | Smoke F1 terrain | ⏳ |

---

## Hors périmètre

[DIAG-TOKENS-CTX.md](DIAG-TOKENS-CTX.md) · [DIAG-DIFF-STATS.md](DIAG-DIFF-STATS.md)
