# AMB-09 — Phases TUI vs fold `thinking` Copilot (Agents)

| | |
|--|--|
| **ID** | AMB-09 |
| **Sévérité** | P1 |
| **Surface** | IDE |
| **Statut** | `fait` |
| **Inventaire** | [AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) |

---

## Problème

Agents range beaucoup de phases moteur dans le fold **thinking** Copilot ; webview expose davantage les phases style TUI → parité UX cassée entre surfaces.

## Contrat TUI (cible)

Phases moteur correctement routées ; l’user suit l’avancement du run.

## Comportement IDE avant patch

Deux enveloppes, deux rendus pour les mêmes événements phase.

## Décision produit (figée)

**Conserver le visuel Copilot** (fold thinking, avancement chat) — jugé fort.  
Le patch = harmoniser *quoi* va dans thinking vs réponse visible / parité Agents↔webview, **pas** remplacer le chrome Copilot par le panneau TUI.

---

## Modifications

| Fichier | Symbole / zone | Changement |
|---------|----------------|------------|
| `common/droxPhaseRoute.ts` | `DROX_THINKING_PHASES`, `isDroxThinkingRoute` | Source de vérité unique |
| `browser/agents/droxAgentsChatSink.ts` | routage `text_delta` | Importe le helper commun |
| `browser/agents/droxAgentsUiReplayHistory.ts` | collector replay | Même helper |
| `media/.../timeline/phases.js` | `LINEAR_THINKING_PHASES` | Commentaire + set aligné |
| `media/.../display/simple.js` | `THINKING_PHASES` | Élargi au set wide (chemin non-linéaire) |

### Tests

- [x] Unit : `reading` / `acting` / `planning` → thinking ; `answering` → markdown
- [x] `isDroxThinkingRoute` — answering / done / null / unknown
- [ ] Smoke manuel : fold Copilot intact ; reply user-facing non mangée

### Hors scope / non touché

- Refonte visuelle type TUI pure (phase-blocks sur Agents)
- AMB-11 (native Ollama thinking)

---

## Acceptation

- [x] Look Copilot conservé
- [x] Parité Agents / webview sur le **set** de phases thinking
- [x] Dual surface (AMB-18) : Agents + webview touchés

## Notes

- Chrome webview (labels `── [Reading] ──`) volontairement distinct — seule la classification du texte est unifiée.
