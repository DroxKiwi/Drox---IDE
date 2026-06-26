# Plan 1.5.9 — UX chat : scroll, reset, composer

**Version** : juin 2026  
**Base** : [1.5.8](../1.5.8/PLAN-1.5.8.md) livrée  
**Branche** : `1.5.9` · tag **`v1.5.9`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **P1** Scroll « stick to bottom » | fait | — |
| **P2** Reset workspace + `MEMORY.md` | fait | — |
| **P3** Composer — icônes bas de fil | fait | — |
| **P4** Splash / release notes 1.5.9 | fait | — |
| **P5** Smoke + ship win + linux | win livré · linux reporté | — |

---

## Périmètre

| In | Hors scope |
|----|------------|
| Scroll intelligent pendant un run (ne pas arracher l’utilisateur en haut du fil) | Connexions MCP → [1.5.x+1](../1.5.x+1/1.5.9/README.md) |
| Reset historique workspace : `.drox/` + `MEMORY.md` racine | Agents Window → [1.5.x+1](../1.5.x+1/1.5.10/README.md) |
| Retrait des 4 icônes redondantes sous le champ de saisie | Nouveaux modes Ask / Analyse moteur |

---

## P1 — Scroll « stick to bottom »

### Problème

Pendant une réponse du modèle, si l’utilisateur remontait pour lire le début du texte, le fil **se repositionnait en bas** à chaque delta (warmup, outils, streaming) — comportement frustrant.

### Solution

Logique centralisée dans `stream/messages/scroll.js` :

| API | Comportement |
|-----|--------------|
| `scrollLog()` | Scroll **uniquement** si `logStickToBottom` (utilisateur proche du bas, seuil ~56 px) |
| `pinLogToBottom()` | Scroll forcé + ancrage (envoi message user, rejeu session) |
| `syncLogStickToBottom()` | Met à jour l’état sur événement `scroll` du `#log` |

Au démarrage d’un run (`setBusy(true)`), l’état stick est **synchronisé** depuis la position réelle du scroll (plus de reset systématique à `false`).

Les appels `scrollLogToEnd()` inconditionnels dans `activity.js`, `simple.js`, etc. ont été remplacés par `scrollLog()` ou `pinLogToBottom()` selon le cas.

### Fichiers

- `browser/media/droxChat/stream/messages/scroll.js`
- `browser/media/droxChat/chrome/busy.js`
- `browser/media/droxChat/chrome/activity.js`
- `browser/media/droxChat/stream/display/simple.js`
- `browser/media/droxChat/stream/timeline/thinking.js`
- `browser/media/droxChat/bridge/10-bootstrap.js`
- (+ call sites : `user.js`, `host-message.js`, `presentation.js`, `memory-chip.js`, `12-fileChange.js`, `stream.js`)

### Smoke

- [ ] Lancer un run long ; remonter dans le fil → le scroll **ne bouge plus** tant qu’on n’est pas en bas
- [ ] Redescendre tout en bas → le fil **suit** à nouveau les nouveaux tokens
- [ ] Envoyer un message user → scroll ancré en bas

---

## P2 — Reset workspace Drox

### Problème

Le bouton **Reset workspace Drox data** (panneau Sessions) purgait `.drox/` mais laissait **`MEMORY.md`** à la racine du workspace — mémoire projet toujours injectée au moteur après un « reset ».

### Solution

`resetDroxWorkspaceOnDisk` supprime en plus :

- `MEMORY.md` à la racine du workspace (`memoryMdRemoved` dans le résultat)

Le contenu `.drox/sessions/` était déjà purgé (tout `.drox/` sauf `.drox/.env`).

Dialogue de confirmation et message de succès mis à jour.

### Fichiers

- `common/droxWorkspaceResetFs.ts`
- `common/droxSessionService.ts` (`memoryMdRemoved`)
- `browser/chat/droxChatWorkspaceReset.ts`
- `browser/chat/droxChatTabsManager.ts`
- `test/common/droxCommon.test.ts`

### Smoke

- [ ] Créer `MEMORY.md` + sessions dans `.drox/sessions/` ; reset → les deux disparaissent, `.drox/.env` conservé
- [ ] Liste sessions vide après reset ; nouvel onglet chat propre

---

## P3 — Composer épuré

### Problème

Quatre icônes en bas du composer (réglages, dossier références, trombone, rechargement modèles) encombraient l’UI ; des accès équivalents existent déjà ailleurs.

### Solution

Suppression des boutons dans `#actions` de `droxChatWebview.ts`. Accès conservés :

| Ancienne icône | Alternative |
|----------------|-------------|
| Réglages | Vignette **Settings** au-dessus du champ |
| Références dossier | `@chemin` dans le prompt |
| Image | glisser-déposer / coller |
| Rechargement modèles | panneau Architect / réglages généraux |

### Fichiers

- `browser/droxChatWebview.ts`

---

## P4 — Splash « What's new » 1.5.9

- `src/vs/workbench/contrib/drox/common/droxReleaseNotes.ts` — entrée `1.5.9`
- `package.json` → `droxVersion` **1.5.9**
- Affichage auto au premier lancement post-mise à jour ; réouverture via le libellé de version dans l’en-tête du chat

---

## Critères de clôture

- [x] Smoke P1–P3 validé
- [x] `droxVersion` **1.5.9** · ship win
- [x] Notes release OR + merge `1.5.9` → `main`
- [x] Linux `.deb` 1.5.9

---

## Liens

- [README 1.5.9](README.md)
- [CLOSURE 1.5.8](../1.5.8/CLOSURE-1.5.8.md)
- [Hub 1.5](../README.md)
