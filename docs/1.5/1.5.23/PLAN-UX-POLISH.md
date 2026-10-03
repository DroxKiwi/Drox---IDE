# Plan — Polish UX / dogfood (1.5.23)

**Parent** : [README 1.5.23](README.md)  
**Statut** : ✅ **clos côté code** (optionnels + dogfood possibles)  
**Ordre** : terminé avant PF

## Cap

Petits sujets remontés au dogfood 1.5.22 — UX, confiance, observabilité. Pas de bump VS Code.

## Backlog

| # | ID | Sujet | Priorité | Statut |
|---|-----|--------|----------|--------|
| 1 | **BADGE** | Pastille sur l’icône activity-bar **Changes** = nb de fichiers non commit | P0 | ✅ |
| 2 | **TERM** | Terminaux agent Cursor-like (session partagée, cartes chat, open in panel) | P1 | ✅ |
| 3 | **SWITCH** | Boutons *Open in Agents* / *Switch to IDE* : vert Drox + logos plus fun | P0 | ✅ |
| 4 | **AUTH** | Retirer boutons / menus d’auth GitHub & GitHub Copilot | P0 | ✅ |
| 5 | **EMBED** | Onglet Codebase : taille embeds, path BDD, disable, purge | P0 | ✅ |
| 6 | **MITM** | Onglet Traffic : capture, tags, alertes, pagination, UI alignée | P1 | ✅ |

## Détail

### 1. BADGE — Changes ✅

- `NumberBadge` sur `DroxViews.ChangesViewContainerId` via `IDroxIdeChangesUiState.stats.files`.
- Masqué si `files === 0`.

### 2. TERM — Terminaux agent ✅

- Session partagée `Drox Agent` (`hideFromUser` pour les one-shots).
- Heuristique reveal pour serveurs / watch (`npm run dev`, …).
- Cartes chat Cursor-like (repliables, menu ⋯, **Open in Terminal**).
- Agents window : ExecBash only (pas d’onglet éditeur qui recouvre le chat).

**Optionnel plus tard** : tools `ide_terminal` list / read / dispose multi-sessions.

### 3. SWITCH — Couleur & logos ✅

- Accent **#3D7A3D** + SVG `drox-agents-switch.svg` / `drox-ide-switch.svg`.

### 4. AUTH — GitHub / Copilot ✅

- `DroxCopilotSignInHiddenContext` sur Accounts Copilot / Manage LM Access / Extension Account Preferences.

### 5. EMBED — Codebase cockpit ✅

- Taille disque + **Vector DB path**, `drox.codebase.embedEnabled`, purge confirmée.
- UI cockpit alignée style Traffic (cartes / boutons / scroll).

### 6. MITM — Observatoire trafic ✅

- View Traffic IDE + Agents ; `enabled` / `mode` ; persist `%userData%/drox-traffic`.
- Hooks moteur (agent.run, fetchHttp, tool/exec…).
- Tags / alertes destination : **liste + remove**, match **partiel** (host / URL / summary), **rétroactif** sur le ledger.
- Ledger paginé (1000 / page, buffer 10k) ; UI allégée (filets verts, pas de cartes remplies).

**Optionnel plus tard** : rejouer fichiers persistés au reopen ; corps LLM plus riches (opt-in).

## Hors polish (reste 1.5.23)

1. ~~**Explore (sub-agents)**~~ — [PLAN-SUBAGENTS-EXPLORE](PLAN-SUBAGENTS-EXPLORE.md) ✅ câblé  
2. ~~**PF**~~ — [PLAN-PORT-FORWARDING](PLAN-PORT-FORWARDING.md) ✅ MVP code · smoke restant  

3. Pass docs / CLOSURE / ship  

**THEME** : reporté hors maj — [PLAN-THEMING](PLAN-THEMING.md).

## Hors scope

- Signature Authenticode / refonte ship.
- Proxy réseau OS global (mitmproxy système).
- Théming Marketplace / thème identité (maj ultérieure).
