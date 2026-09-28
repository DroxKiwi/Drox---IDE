# AMB-12 — Gates / LoopDetected vs recovery UI asymétrique

| | |
|--|--|
| **ID** | AMB-12 |
| **Sévérité** | P1 |
| **Surface** | IDE |
| **Statut** | **fait** (parité message loop Agents ↔ webview) |
| **Inventaire** | [AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) |

---

## Problème

Webview : hint loop + erreur friendly ; Agents : brut `Loop detected: …` + Retry.

## Décision produit

Même texte hint/error via helper partagé. Agents garde le bouton **Retry** (Resume/Restart webview = hors scope).

---

## Modifications

| Fichier | Symbole / zone | Changement |
|---------|----------------|------------|
| `common/droxLoopAbort.ts` | **nouveau** | `isDroxLoopDetectedError`, hints, `formatDroxAgentsLoopAbortMessage` |
| `browser/droxChatAgentEvents.ts` | `dispatchAgentDone` | utilise le helper |
| `browser/agents/droxAgentsChatSink.ts` | `handleAgentDone` | rewrite markdown loop |
| `browser/agents/droxAgentsSessionHandler.ts` | `_retryableError` path | même rewrite sur `errorDetails` |
| tests | sink + `droxLoopAbortAndPlanArchive` | cover |

### Tests

- [x] Unit rewrite loop
- [ ] Smoke Agents : abort LD → message compréhensible + Retry

### Hors scope

- Boutons Resume/Restart sur Agents
- Seuils LoopDetector Rust

---

## Acceptation

- [x] Agents n’affiche plus le brut « Loop detected » seul
- [x] Webview inchangé fonctionnellement (helper partagé)

## Notes

- Cas référence : `docs/chat.txt`.
