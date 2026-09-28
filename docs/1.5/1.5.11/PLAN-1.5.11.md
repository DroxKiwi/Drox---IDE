# Plan 1.5.11 — Chat natif Drox (moteur + portage sélectif)

**Version** : juin 2026  
**Base** : [1.5.10](../1.5.10/PLAN-1.5.10.md) livrée  
**Branche** : `1.5.11` · tag cible **`v1.5.11`**

---

## En une phrase

Brancher **`drox.exe`** dans le **flux de discussion natif** VS Code (`ChatWidget` — châssis **Copilot-style**, **sans** provider Copilot), porter **sélectivement** le fonctionnel webview (tools, replay, config), **canal nominal IDE = natif** — webview legacy masquée (réactivable en dev).

---

## Périmètre de ce plan

| **Dans ce plan** | **Hors ce plan** (livré ailleurs ou reporté) |
|------------------|-----------------------------------------------|
| Moteur Drox dans `ChatWidget` (IDE Native + fenêtre Agents via même stack) | Wizard connexion cloud (**livré**, fonctionnel) |
| Portage sélectif webview → natif ([matrice](COMPARE-WEBVIEW-VS-NATIF.md)) | Customizations harness `drox` (livré 1.5.11 antérieur — smoke optionnel) |
| **Historique** sessions + reprise au redémarrage (natif) | Panneau Changes / Files (**P3**, post-MVP) |
| Config serveur / modèles **partagée et persistante** IDE ↔ Agents (**CFG**) | LM API Microsoft / login Copilot |
| Composer Drox (server, model, modes) — **sans** refonte visuelle du fil | Rebrand cosmétique vert / strip TUI webview (**reporté** — fil Copilot-style validé) |
| **Canal nominal IDE = natif** ; webview legacy masquée (`drox.ideLegacyWebviewChat.enabled`) | Réécriture complète `media/droxChat/*` |
| | Modifications moteur Rust (nominal) |

**Décisions figées** :
- Partir du **chat natif**, enrichir avec le meilleur **fonctionnel** du webview — **ne pas** faire évoluer la webview comme cible long terme du panneau IDE.
- **Fil Copilot-style** conservé (pas de strip TUI rétro webview, pas de rebrand vert poussé pour 1.5.11).

---

### État d'avancement

| Pilier | Avancement | Détail |
|--------|------------|--------|
| **M1** Moteur dans le flux natif | **fait** | Smokes E2E IDE Native + Agents validés |
| **M2** Portage sélectif webview | **fait** | ≥ 80 % matrice · historique partagé · replay natif — [COMPARE](COMPARE-WEBVIEW-VS-NATIF.md) |
| **M3** Rebrand flux discussion | **gelé** | Composer + masquage Copilot **faits** ; cosmétique vert / strip TUI **hors 1.5.11** |
| **CFG** Config chat unifiée | **fait** | USER canonique · modèle IDE ↔ Agents · smokes validés |
| **SHIP** Bascule canal nominal (natif par défaut) | **fait** | Webview masquée · routage actions IDE → natif |

**Statut release** : **livré OR** — Windows + Linux `v1.5.11` ([CLOSURE](CLOSURE-1.5.11.md)).

---

## Architecture cible

```text
┌─ Châssis upstream (ChatWidget / ChatInputPart) ─────────────────┐
│  Visuel type Copilot · DnD · paste éditeur · tool cards MS      │
└────────────────────────────┬───────────────────────────────────┘
                             │ session type `drox` · agent verrouillé
┌────────────────────────────▼───────────────────────────────────┐
│  Couche Drox IDE                                                │
│  · droxAgentsSessionHandler · droxAgentRunBridge                  │
│  · droxAgentsChatSink · DroxAgentsComposerToolbar               │
│  · IDroxClientToolsService · IDroxUserAskService               │
└────────────────────────────┬───────────────────────────────────┘
                             │ JSON-RPC
┌────────────────────────────▼───────────────────────────────────┐
│  drox.exe                                                       │
└─────────────────────────────────────────────────────────────────┘

Surfaces (même stack) :
  · Panneau IDE — onglet « Drox » natif (`drox.ideNativeChatTab.enabled`, défaut true)
  · Fenêtre Agents — fil chat (`chatView.ts`)
  · Référence gelée — onglet « Webview » (`drox.ideLegacyWebviewChat.enabled`, défaut false)
```

**Anti-patterns** : `CopilotChatSessionsProvider` · run via LM API MS · dupliquer la webview en JS parallèle · améliorer Native sans passer par sink/composer partagés.

Détail fichiers : [IMPLEMENTATION-1.5.11.md](IMPLEMENTATION-1.5.11.md) · écarts webview : [COMPARE-WEBVIEW-VS-NATIF.md](COMPARE-WEBVIEW-VS-NATIF.md).

---

## Pilier M1 — Moteur Drox dans le flux chat natif

**Objectif** : un prompt dans le chat natif déclenche un run `agent.run` complet (stream, tools, ask, cancel) — **pas** Copilot cloud.

| # | Tâche | État |
|---|--------|------|
| M1-1 | Session type `drox` + `droxAgentsSessionHandler` | **fait** |
| M1-2 | `droxAgentRunBridge` partagé webview / natif | **fait** |
| M1-3 | Onglet IDE Native (`DroxNativeChatViewPane` + flag) | **fait** |
| M1-4 | Lock agent `drox` + `workingDirectory` workspace | **fait** |
| M1-5 | Provider modèles `DroxAgentsLanguageModelProvider` | **fait** |
| M1-6 | Composer (Server, Model, modes permission) sur input natif | **fait** |
| M1-7 | `droxAgentsChatSink` → `IChatProgress` (stream, thinking, tools) | **partiel** |
| M1-8 | Fenêtre Agents : même handler (pas de second stack) | **fait** |
| M1-10 | Sync `runId` / `tool/exec` (natif ↔ `droxClientTools`) | **fait** |
| M1-9 | Smoke run E2E IDE Native + Agents (même config) | **fait** |

**Done M1** : prompt → réponse streamée via `drox.exe` ; cancel + ask user OK ; visible sur **IDE Native et Agents**.

---

## Pilier M2 — Portage sélectif (meilleur webview → natif)

**Objectif** : garder le **look Copilot** ; récupérer les **outils Drox** qui manquent au natif. Matrice complète : [COMPARE](COMPARE-WEBVIEW-VS-NATIF.md).

### Priorités

| Prio | Depuis webview | Cible | État |
|------|----------------|-------|------|
| **P1** | Cartes file-change + diff + undo | `droxAgentsChatSink` + `droxNativeFileChangeMarkdown` | **fait** |
| **P1** | Thinking / phases / `user_facing_reply` | Enrichir sink | partiel |
| **P2** | Images, references, paste → prompt moteur | Capacités contribution `drox` | **fait** (images) · refs/paste partiel |
| **P2** | Replay `.ui-replay.jsonl` | `droxAgentsUiReplayHistory` | **fait** (file-change + images) |
| **P2** | DnD / paste éditeur / contexte implicite | Déjà upstream — activer + tester | partiel |
| **P3** | TUI strip WORK rétro | — | **refusé** (fil Copilot-style préféré) |

### Phasage M2

| # | Tâche | Surfaces |
|---|--------|----------|
| M2-a | Checklist [COMPARE E1–E12](COMPARE-WEBVIEW-VS-NATIF.md) — documenter chaque écart | doc |
| M2-b | Implémenter E1–E2 (diff + undo fil natif) | **fait** (carte HTML, pilule `externalEdit`, undo/redo, scroll molette diff) |
| M2-c | E3 attachments · E8 replay journal | **fait** (images smoke OK · replay file-change + images dans `buildDroxAgentsHistoryFromUiReplay`) |
| M2-f | **Historique sessions** : liste `.drox/sessions/`, rouvrir dernière session, replay fil au démarrage (IDE Native + Agents) | **fait** — liste disque partagée · **persistance croisée** `droxSharedChatSessionHistory` · picker IDE style Agents/Copilot · sync fenêtre Agents |
| M2-g | **Replay UI natif** : journal `.ui-replay.jsonl` écrit par le sink natif (tools, diff, images au rechargement) | **fait** — `droxNativeUiReplayRecorder` + `finalizeDroxNativeChatHistoryModel` ; sessions 100 % natif pré-patch = journal incomplet jusqu’au prochain message |
| M2-h | **Phrases thinking** Drox (remplace chaînes Copilot upstream) | **fait** — `droxThinkingPhrases.ts` + `droxProductDefaultsConfiguration` |
| M2-d | **Revue Agents** : chaque PR M2 smoke IDE **et** fenêtre Agents (P5-f) | Agents |
| M2-e | Décision diff : cartes Drox **vs** `IChatEditingService` | **fait** — cartes Drox conservées |

**Done M2** : checklist COMPARE ≥ **80 %** ; pas de régression moteur ; webview inchangée (non-régression).

---

## Pilier M3 — Identité Drox (sans refonte du fil)

**Objectif minimal** : pas de Copilot sur le chemin nominal + composer Drox fonctionnel. **Pas** de rebrand visuel poussé pour 1.5.11.

| # | Tâche | État |
|---|--------|------|
| M3-1 | Masquer Sign In / affordances Copilot sur chemin Drox | **fait** |
| M3-2 | Composer Drox (chips Server / Model / Trust Edit…) | **fait** |
| M3-3 | Barre stats tokens (↑↓ cycle ctx) | **fait** |
| M3-8 | Chaînes nls : pas de « Copilot » sur chemin nominal | **fait** |
| M3-4 / M3-5 / M3-7 | CSS vert poussé IDE + Agents, factorisation tokens | **reporté** (fil Copilot-style validé) |
| M3-6 | Typo VT323 fenêtre Agents | **fait** — inchangé |

**Done M3 (1.5.11)** : identité fonctionnelle Drox ; **apparence du fil = upstream Copilot chassis**.

---

## CFG — Configuration chat unifiée (prérequis M1/M2)

**Problème** : connexion cloud et modèles **fonctionnent**, mais IDE (scope workspace) et fenêtre Agents (scope USER) peuvent **diverger**.

| # | Tâche | État |
|---|--------|------|
| CFG-1 | Audit clés `drox.*` + call sites | **fait** |
| CFG-2 | Politique merge (USER canonique connexion LLM ; override workspace optionnel) | **fait** |
| CFG-3 | API unifiée read/write (`readDroxChatConfigurationValue` / `applyDroxConfigurationUpdate`) | **fait** |
| CFG-4 | Fan-out `onDidChangeConfiguration` → webview + composers + liste modèles | **fait** |
| CFG-5 | Picker modèle aligné (webview, natif, Agents) | **fait** |
| CFG-6 | Persistance serveur/modèle/mode **Agents ↔ IDE** (live au focus + redémarrage) | **fait** — USER canonique · picker AW écrit USER au clic seulement · smokes validés |
| CFG-7 | Picker modèle natif aligné au redémarrage (`drox.architect.model`) | **fait** — `chatInputPart._preferDroxArchitectModel` |

**Done CFG** : une modification connexion/modèle se reflète sur **toutes** les surfaces chat Drox.

---

## Onglets IDE (dev / non-régression)

```text
Panneau Drox (défaut 1.5.11)
├── Onglet « Drox »     → natif ChatWidget + drox.exe (canal nominal)
└── Onglet « Webview »  → legacy webview (flag `drox.ideLegacyWebviewChat.enabled`)
```

Routage : `droxIdeChatViewRoute.ts` · Ctrl+L / New Chat → natif.

---

## Critères d'acceptation `v1.5.11`

- [x] Chat natif (IDE Native **ou** Agents) exécute un run via **`drox.exe`** sans login Copilot
- [x] Stream + au moins un tool + cancel + ask user
- [x] Composer Drox visible (server, model, modes)
- [x] **CFG-6** : config serveur/modèle cohérente IDE ↔ Agents (live + redémarrage)
- [x] Webview onglet 1 **non régressée**
- [x] Pas de mention Copilot sur le chemin nominal (smoke)
- [x] **Historique** : rouvrir une session passée avec replay fil (IDE Native **ou** Agents)
- [x] **Canal nominal** : panneau IDE ouvre le natif par défaut ; webview masquée (code conservé)
- [x] Ship OR Windows + Linux (`droxVersion` **1.5.11**)

---

## Ordre de travail recommandé

```text
1. Merge 1.5.11 → main
2. ~~npm run drox:ship~~ ✅ Windows v1.5.11
3. ~~Tag v1.5.11 + latest.json~~ ✅
4. ~~Linux .deb 1.5.11~~ ✅
```

Post-1.5.11 : polish thinking sink · suppression code webview (optionnel) · MCP (#16).

---

## Déjà livré (ne pas replanifier ici)

| Chantier | Note |
|----------|------|
| Connexion cloud (wizard, Bearer, 5 prestataires) | **Fonctionnel** — hors périmètre actif |
| `DroxSessionsProvider` + fenêtre Agents de base | Socle M1 |
| Harness Customizations `drox` | Livré ; smoke M9–M11 optionnel |
| `droxAgentRunBridge` extraction | Partagé webview / natif |
| Spike onglet Native + composer | M1-3 / M1-6 |
| **CFG** config chat unifiée (scope USER) | `droxAgentsConfiguration.ts` |
| **M2-b** cartes file-change natif | `droxNativeFileChangeMarkdown` · undo/redo · scroll molette diff |
| Sync `runId` natif (`tool/exec`) | `droxAgentsSessionHandler` |
| **M2-c** images natif + replay ui-replay | `droxNativeChatRequestAttachments` · `droxAgentsUiReplayHistory` |
| Smoke images natif | Validé utilisateur |
| **M2-f** historique IDE Native + smoke reprise | `droxNativeChatSessionStore` · resolver · actions titre |
| **M2-i** historique partagé IDE ↔ Agents | `droxSharedChatSessionHistory` · `droxAgentSessionsPicker` · `droxSessionsActiveSessionSync` |
| **M2-g** replay UI natif (`.ui-replay.jsonl`) | `droxNativeUiReplayRecorder` · finalize history |
| **M2-h** phrases thinking Drox | `droxThinkingPhrases.ts` |
| **CFG-7** modèle architect au redémarrage | `chatInputPart._preferDroxArchitectModel` |
| **SHIP** Bascule canal nominal IDE | `droxIdeChatViewRoute` · flags `ideNativeChatTab` / `ideLegacyWebviewChat` |

---

## Reporté (hors plan 1.5.11)

| Chantier | Référence |
|----------|-----------|
| Rebrand vert poussé (M3-4, M3-5, M3-7) | Fil Copilot-style validé — report post-1.5.11 |
| Strip TUI WORK rétro (P3) | Refusé produit |
| Panneau Changes / Files | P3 post-MVP |
| Suppression code webview IDE | Optionnel post-1.5.11 (masquée par défaut depuis ship) |
| MCP UI + moteur complet | [#16](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md) |
| Client OpenAI-compatible côté moteur (hors Ollama) | moteur |

---

## Liens

- [README 1.5.11](README.md)
- [COMPARE-WEBVIEW-VS-NATIF.md](COMPARE-WEBVIEW-VS-NATIF.md)
- [IMPLEMENTATION-1.5.11.md](IMPLEMENTATION-1.5.11.md) — détail technique historique P0–P4
- [13-agents-window-kdds-drox.md](../../feature-brainstorm/13-agents-window-kdds-drox.md)
