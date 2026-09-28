# Dettes webview chat — clôture 1.3.2

**Statut** : dette technique **en traitement** — exécution [CHANTIER-WEBVIEW-1.3.2.md](CHANTIER-WEBVIEW-1.3.2.md) (phase W0 démarrée).

**Code** : `src/vs/workbench/contrib/drox/browser/media/droxChat/`  
**Chargement** : `DROX_CHAT_SCRIPT_FILES` dans `droxChatWebview.ts`

---

## Contexte

Le découpage modulaire (phase 1–2, voir [DECOUPAGE-CHAT-WEBVIEW.md](../DECOUPAGE-CHAT-WEBVIEW.md)) a réduit les fichiers monolithiques, mais la **structure globale** reste fragile pour l’évolution produit (Agents Window, virtualisation, typage host↔webview).

Dogfood 1.3.2 (session `ses_7f5d7903`, [chat.txt](../chat.txt)) : **Drox + IDE OK** — ces points n’empêchent pas la release moteur.

---

## Dette #1 — État global `DroxChat` / `D.state`

| | |
|---|---|
| **Symptôme** | ~66 scripts, ~90 champs sur un objet global mutable ; ordre de chargement implicite |
| **Risque** | Régressions silencieuses, couplage fort entre modules, tests difficiles |
| **Piste** | Module d’état typé (store léger ou façade par domaine : stream / composer / settings) ; conserver l’API `D.*` en shim pendant migration |

---

## Dette #2 — Couplage host ↔ webview

| | |
|---|---|
| **Symptôme** | `host-message.js` (~35 `kind`) + `droxChatWebviewRouter.ts` (~30 cas) sans contrat partagé |
| **Risque** | Message oublié d’un côté, typo de `kind`, pas de validation à la compile |
| **Piste** | Schéma TypeScript généré ou union discriminée unique (`DroxChatHostMessage`) ; handlers typés par `kind` ; tests unitaires router |

---

## Dette #3 — DOM direct, pas de virtualisation

| | |
|---|---|
| **Symptôme** | Timeline / log appendent des nœuds DOM ; pas de fenêtre virtuelle sur longs runs |
| **Risque** | Perf et mémoire sur transcripts longs (dogfood multi-outils) |
| **Piste** | Virtualisation liste messages (comme VS Code list/tree) ou plafond + « load older » ; mesurer avant refonte |

---

## Dette #4 — 66 `<script>` séquentiels

| | |
|---|---|
| **Symptôme** | `DROX_CHAT_SCRIPT_FILES` charge chaque module à la main, ordre fragile |
| **Risque** | Temps de boot webview, maintenance du manifeste, pas de tree-shaking |
| **Piste** | Bundle esbuild/rollup **webview-only** (IIFE + source maps) ; un seul point d’entrée ; garder le split source pour la lisibilité |

---

## Critère de clôture dette (hors 1.3.2)

- [ ] #2 : contrat host messages typé + tests router
- [ ] #1 : état scindé par domaine (au moins stream + settings)
- [ ] #4 : bundle webview (smoke chat inchangé)
- [ ] #3 : virtualisation ou budget perf documenté sur run > N messages

---

## Liens

- [DECOUPAGE-CHAT-WEBVIEW.md](../DECOUPAGE-CHAT-WEBVIEW.md)
- [CLOSURE-1.3.2.md](CLOSURE-1.3.2.md)
- [feature-brainstorm/13-agents-window-kdds-drox.md](../../feature-brainstorm/13-agents-window-kdds-drox.md)
