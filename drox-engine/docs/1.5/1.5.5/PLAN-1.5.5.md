# Plan 1.5.5 — Fil de discussion : superposition des blocs

**Version** : juin 2026  
**Base** : [1.5.4](../1.5.4/PLAN-1.5.4.md)  
**Branche** : `1.5.5` · tag **`v1.5.5`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **F1** Repro & smoke long fil | en cours | oui |
| **F2** Correctif layout sticky / scellement | en cours | oui |
| **F3** Régression multi-tours (stop, replay) | 0 % | oui |
| **F4** Release win + linux | 0 % | oui |

---

## Symptôme

Après **plusieurs messages** dans une même session, le fil « part en vrille » :

- cartes user, bandeau « Commit regularly », bloc **WORK**, checklist **Plan** empilés les uns sur les autres ;
- le défilement ne reflète plus l’ordre chronologique ;
- observé après un run long, parfois après **stop** puis nouvelle consigne.

Capture de référence : session « Initialiser un site Next.js dark… », v1.5.4.

---

## Périmètre

| In | Hors scope |
|----|------------|
| Webview `contrib/drox` — strip linéaire, CSS fil, `setBusy` | Moteur Rust, protocole RPC |
| Scellement `.drox-run-strip`, sticky user, plan footer | Refonte complète du fil (1.6+) |

---

## Cartographie technique

### DOM nominal (run linéaire 1.5.1+)

```text
#log
  ├─ .msg-user-block > .msg-row-user
  ├─ .drox-run-strip[data-sealed="1"]   ← tours passés
  ├─ .msg-user-block …
  └─ .drox-run-strip:not([data-sealed]) ← tour actif
       ├─ .drox-run-plan-slot (ou plan dans #plan-sticky-footer)
       ├─ details.drox-run-work-collapsible
       └─ [data-section="answer"]
```

Fichiers clés :

| Fichier | Rôle |
|---------|------|
| `stream/timeline/strip.js` | strip, scellement, ancrage après user |
| `stream/timeline/overrides.js` | `setBusy` → seal / `endLinearRunStrip` |
| `stream/answer/helpers.js` | `refreshLastUserStickyRow` |
| `media/droxChatMvp.css` | `#log` flex, sticky user, strip sealed |
| `bridge/host-message.js` | replay, append user, `busy` |

---

## Causes probables (audit juin 2026)

### C1 — Ordre `setBusy(false)` (P0, **évident**)

Dans `overrides.js`, `document.body.classList.remove('drox-linear-run-active')` s’exécute **avant** `sealAllOpenRunStrips()`.

Pendant cette fenêtre :

- les règles CSS **sticky user** (`is-last-user-sticky`) redeviennent actives ;
- le strip du tour peut encore être **non scellé** (`position` sticky / pile z-index) ;
- au scroll ou à l’ajout du message suivant → **superposition**.

**Correctif** : retirer la classe body **après** scellement ; rafraîchir sticky user + `syncStickyStackLayout`.

### C2 — Strips ouverts multiples (P0)

`ensureRunStrip` adopte le dernier strip ouvert ; si un strip intermédiaire n’a pas été scellé (`anchorRunStripAfterUser`, replay, stop), plusieurs blocs actifs coexistent.

**Correctif** : `pruneExtraOpenRunStrips` / `sealAllOpenRunStrips` systématiques en fin de tour et après replay.

### C3 — Plan déplacé entre strips (P1, proche W4 / 1.5.3)

`reparentTodoBlockToPlan` + `currentTodoBlockEl` : plan du tour N visible dans le strip N+1 si reset incomplet.

Déjà partiellement corrigé en 1.5.3 ; à re-vérifier sur fil **long** (3+ tours).

### C4 — Replay session (P1)

`replayPrepare` → `beginLinearRunStrip` sans `busy` ; `anchorRunStripAfterUser` avec branches `!D.state.busy` peut laisser des strips vides ou mal positionnés avant `finalizeSessionReplayUi`.

### C5 — Sticky user seul en tête (P2)

Un seul `.is-last-user-sticky` est géré, mais si la classe body et le voisin `+ .drox-run-strip` divergent, le bloc user peut rester `position: sticky` au-dessus du contenu suivant.

---

## Plan de correction

### F2 — Correctifs immédiats

1. Réordonner `setBusy(false)` (C1).
2. Après scellement : `refreshLastUserStickyRow`, `syncPlanStickyFooter`, `syncStickyStackLayout`.
3. À la fin de `anchorRunStripAfterUser` : vérifier qu’au plus **un** strip `:not([data-sealed])` sous `#log`.

### F3 — Smoke

- [ ] 3 tours user successifs (run complet à chaque fois)
- [ ] Stop milieu de run → nouvelle consigne
- [ ] Réouverture session (replay historique 20+ messages)
- [ ] Scroll haut/bas pendant run actif

### F4 — Release

- [ ] `droxVersion` **1.5.5**
- [ ] `npm run drox:ship` (win) + pipeline Linux isolé
- [ ] Tag `v1.5.5` sur `Drox---IDE---OR`

---

## Décalage roadmap

| Ancien | Nouveau |
|--------|---------|
| 1.5.6 MCP | **1.5.7** |
| 1.5.7 Agents Window | **1.5.8** |
| — | **1.5.5** ce correctif fil · **1.5.6** correctifs post-release |

---

## Liens

- [README 1.5.5](README.md)
- [Hub 1.5](../README.md)
