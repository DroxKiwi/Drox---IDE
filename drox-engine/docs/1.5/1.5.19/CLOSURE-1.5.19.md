# Clôture 1.5.19

**Branche** : `1.5.19` (conservée après merge)  
**Version** : `droxVersion` **1.5.19**

## Livré

| Pilier | Contenu |
|--------|---------|
| **Badge + Git Graph** | Badge branche · service branches · graphe natif (parité Git Graph) · sync Changes sur dirty set |
| **Chat Agents → IDE** | Handoff `sessionId` one-shot · timeout soft load session · empty-state Native Chat |
| **Moteur agent** | Mutateurs unifiés · LoopDetector (thinking / strikes) · gates bash/todo |
| **Ollama / KAT** | Inline `$ref` schema · coalesce system messages · fingerprint thinking (E16–E18) |

## Docs

- [README.md](README.md)
- [ENGINE-RUST-AGENT-LOOPS.md](ENGINE-RUST-AGENT-LOOPS.md)
- [ENGINE-OLLAMA-THINKING-AND-LOOPS.md](ENGINE-OLLAMA-THINKING-AND-LOOPS.md)
- [PLAN-MUTATORS-AND-TRANSCRIPT-EXPORT.md](PLAN-MUTATORS-AND-TRANSCRIPT-EXPORT.md)
- [PLAN-GIT-BRANCH-GRAPH.md](PLAN-GIT-BRANCH-GRAPH.md)

## Popup nouveautés

`droxReleaseNotes.ts` — case `1.5.19` (lead + items). Affichée à la première ouverture après install si `seenVersion` ≠ `1.5.19`.

## Ship

Windows + Linux → repo OR `Drox---IDE---OR` tag `v1.5.19`.
