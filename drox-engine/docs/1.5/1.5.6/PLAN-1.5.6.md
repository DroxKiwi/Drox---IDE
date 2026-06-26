# Plan 1.5.6 — Correctifs post-release 1.5.5

**Version** : juin 2026  
**Base** : [1.5.5](../1.5.5/PLAN-1.5.5.md) livrée  
**Branche** : `1.5.6` · tag **`v1.5.6`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **F1** Repro & diagnostic | 100 % | non |
| **F2** Correctif(s) | 100 % | non |
| **F3** Smoke + release win + linux | 100 % | non |

---

## Périmètre

| In | Hors scope |
|----|------------|
| Bugs bloquants ou gênants sur **1.5.5** (chat, fil, UI, install) | Connexions MCP → [1.5.8](../1.5.8/README.md) |
| Correctifs webview / host `contrib/drox` | Agents Window → [1.5.x+1/1.5.9](../1.5.x+1/1.5.9/README.md) |
| Release OR `v1.5.6` | Refonte moteur |

---

## Symptômes

### B1 — Bulle utilisateur absente après erreur / reprise

- **Repro** : reprendre une session → coupure réseau → erreur LLM affichée → renvoyer le même message → la bulle user n'apparaît pas (warmup / outils / erreur sans séparateur).
- **Règle** : le message utilisateur doit être la **première** chose visible du tour, quel que soit le scénario (retry, erreur host, reprise).

### B2 — Diffs sans scroll interne

- **Repro** : gros diffs multi-fichiers → le fil `#log` s'étire sur des centaines de lignes ; plus de barre de défilement dans le bloc diff (régression 1.5.5 : `max-height: none` sur `.fc-body`).

---

## Correctifs (1.5.6)

| Bug | Fichiers | Approche |
|-----|----------|----------|
| B1 | `composer/send.js`, `stream/messages/user.js`, `bridge/host-message.js` | Bulle user **optimiste** à l'envoi ; à l'`append` host : retirer l'optimiste puis **toujours** `appendToLog` (pas de `replaceWith` qui pouvait avaler le tour) |
| B1b | `history-replay.js`, `display/simple.js` | `getLinearInsertBefore` : ne plus insérer avant une réponse passée ; `resolveUserReplyMount` → `#log` hors mode strip |
| B2 | `droxChatMvp.css`, `droxChatThreadTui.css` | `max-height: min(52vh, 360px)` + `overflow-y: auto` sur `.msg-file-change > .fc-body` uniquement |

---

## Critères d'acceptation

- [x] Repro documentée
- [x] Correctif validé en dev (`npm run watch` / build packagé)
- [x] Smoke chat : envoi, fil, reprise session → erreur → retry → bulle user visible
- [x] Smoke diff : gros patch repliable avec scroll interne, fil `#log` raisonnable
- [x] `droxVersion` **1.5.6** · ship win puis linux

---

## Décalage roadmap (juin 2026)

| Ancien | Nouveau |
|--------|---------|
| 1.5.6 MCP | **1.5.8** |
| 1.5.7 Agents Window | **1.5.x+1** (ex-1.5.9) |
| — | **1.5.6** ce slot correctifs post-1.5.5 |
| — | **1.5.7** correctifs post-1.5.6 (branche courante) |

---

## Liens

- [README 1.5.6](README.md)
- [PLAN 1.5.7](../1.5.7/PLAN-1.5.7.md)
- [PLAN 1.5.8 MCP](../1.5.8/PLAN-1.5.8.md)
- [PLAN 1.5.9 Agents](../1.5.x+1/1.5.9/PLAN-1.5.9.md)
