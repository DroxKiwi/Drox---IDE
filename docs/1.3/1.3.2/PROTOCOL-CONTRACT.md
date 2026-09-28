# Contrat protocole — gates, runs, affichage UI (1.3.2)

**Statut** : référence normative — toute évolution moteur ou webview doit respecter ce document ou le mettre à jour **dans le même PR**.  
**But** : supprimer les surprises (texte au mauvais endroit, gate invisible, run qui démarre sans chemin connu).

**Documents détaillés** : [GATE-SPEC.md](gates/GATE-SPEC.md) · [gate-graph.json](../../drox/crates/drox-engine/assets/gates/gate-graph.json) · [FILE-CONDUCTEUR-CHEMINS-CYCLE.md](FILE-CONDUCTEUR-CHEMINS-CYCLE.md) · webview `stream/display/simple.js`

---

## 1. Vocabulaire borné

### 1.1 Gate (moteur)

Une **gate** est un **nœud de décision pré-run** (chaîne C1), pas un tour de discussion ni un palier edit.

| Propriété | Valeur autorisée |
|-----------|------------------|
| **Où** | Fichier `assets/gates/<id>.gate.toml` + entrée dans `gate-graph.json` |
| **Rôle LLM** | `architect_intent` uniquement |
| **Outils** | **Aucun** (`tools_during_probes: false`) |
| **Entrée modèle** | `[question]` + bulles `context.bubbles` |
| **Sortie modèle** | JSON validé par `response_schema` (`exclusive_open` ou `boolean`) |
| **Effet** | Transition vers un autre nœud **ou** terminal `START_RUN.*` |

**Ce n’est pas une gate** (ne pas confondre) :

| Concept | Nature |
|---------|--------|
| `EditTier` (`e_none`, `e_plan`, …) | Palier **in-run edit** (C2) — hors graphe gates MVP |
| `tool_pre_gate` / bloqueurs outils | Gate **bloquante** (C3) — avant exécution tool |
| Marqueur `[phase: …]` dans le stream | Protocole **phase**, pas gate TOML |
| JSON `{"open":…}` affiché dans Thinking | **Artefact** du tour gate — jamais réponse user |

### 1.2 Run

Un **run** = un `agent.run` déclenché par un message user (`run_id`).

| `START_RUN` (terminal C1) | Rôle LLM | Réponse user |
|---------------------------|----------|--------------|
| `discuss_reply_only` | `architect_discussion` | `UserFacingReply` |
| `discuss_with_reads` | `architect_discussion` | `UserFacingReply` (+ outils lecture) |
| `analyze` | `architect_discussion` | `UserFacingReply` (+ outils lecture) |
| `edit` / `edit_e_none` | `architect` | Stream chat + phases |

### 1.3 Surface UI (webview)

Trois **seules** destinations pour le texte assistant :

| Surface | Id DOM / section | Contenu autorisé |
|---------|------------------|------------------|
| **Thinking** | `[data-section="thinking"]` | Raisonnement interne, chaîne gate C1, JSON gate, phases `internal_reasoning` / `reasoning` |
| **Chat** | `[data-section="answer"]` du strip du tour | Prose user-facing, stream discussion, synthèse analyze |
| **Work** | `[data-section="work"]` / `verify` | Outils, sous-agents, todos — **pas** de prose longue |

**Invariant** : un delta texte va dans **exactement une** surface (voir §3).

---

## 2. Bus d’événements moteur → IDE

Source : `AgentEvent` (`drox-engine/src/event.rs`) → `dispatchAgentEvent` (`droxChatAgentEvents.ts`) → `handleHostMessage` (`host-message.js`).

### 2.1 Événements gates

| `AgentEvent` | Message webview | Visible user (prod) | Comportement UI **obligatoire** |
|--------------|-----------------|---------------------|----------------------------------|
| `GateProbe` | `gateDev` `phase: probe` | Non (sauf `DROX_DEV_GATE_TAGS`) | Si tags dev : label gate ; sinon **aucun** rendu |
| `GatePass` | `gateDev` `phase: response` | Non (sauf dev) | Idem ; le JSON modèle va en **Thinking** via deltas |
| `GatePath` | `gateDev` `phase: complete` | Non (sauf dev) | Fin chaîne ; `startRun` mémorisé côté moteur uniquement |

**Règle** : en production (`devGateTagsEnabled = false`), **aucune** gate ne produit de bulle chat user-facing. Seul le panneau Thinking reçoit le flux `architect_intent`.

### 2.2 Événements run / texte

| `AgentEvent` | Message webview | Surface UI | Comportement **obligatoire** |
|--------------|-----------------|------------|------------------------------|
| `RoleEnter` `architect_intent` | `orchestrationRole` | — | `architectGateChainActive = true` → deltas → Thinking |
| `RoleEnter` `architect_discussion` | `orchestrationRole` | Thinking shell | `architectGateChainActive = false` |
| `RoleEnter` `architect` | `orchestrationRole` | banner strip | Fin chaîne gate ; run edit |
| `PhaseEnter` `internal_reasoning` | `phase` | Thinking | Ouvre / alimente shell Thinking |
| `PhaseEnter` `reading`…`clarifying` | `phase` | Thinking (linéaire) | Métadonnée phase ; pas chat |
| `PhaseEnter` `answering` | `phase` | Chat | Début stream réponse (legacy explore) |
| `TextDelta` | `delta` | Voir §3 | Routage `routeSimpleDisplayDelta` |
| `UserFacingReply` | `userFacingReply` | Chat | Texte **canonique** discussion — remplace stream partiel |
| `ToolStart` / `ToolFinish` | `tool` | Work / verify | Jamais dans answer |
| `Stop` | `state` `busy: false` | — | Scelle strip, `finalizeAssistant` |

### 2.3 Un tour utilisateur (strip)

| Événement | Effet DOM |
|-----------|-----------|
| `append` `role: user` | Nouveau `.msg-row-user` ; `anchorRunStripAfterUser` → strip **après** ce user |
| Premier `delta` / `tool` / `todo` du run | `commitRunStripAnchor` — strip verrouillé sous ce user |
| `state` `busy: false` | `sealRunStrip` ; fin du tour |

**Invariant** : la réponse du tour N reste dans le strip **après** le message user N, jamais déplacée vers N+1.

---

## 3. Routage texte (webview — `simple.js`)

Implémentation unique : `routeSimpleDisplayDelta`, `applyUserFacingReply`, `deltaBelongsInThinking`.

```
TextDelta reçu (appendDelta → routeSimpleDisplayDelta)
    │
    ├─ architectGateChainActive ? ──► Thinking
    ├─ chunk ressemble JSON gate {"gate"|"open"} ? ──► Thinking
    ├─ phase ∈ {internal_reasoning, reasoning} ? ──► Thinking (même en run discussion)
    ├─ [phase: answering] dans chunk ? ──► split → avant Thinking, après Chat
    ├─ run discussion actif (hors phase thinking) ? ──► Chat (stream preview)
    └─ sinon ──► Chat (section answer du strip courant)
```

| Marqueur / format | Traitement |
|-------------------|------------|
| `[discussion: reply]` | Supprimé avant affichage (protocole moteur) |
| `[discussion: done]` | Supprimé ; peut clôturer stream |
| `[phase: done]` | Supprimé |
| `{"gate":…,"value":…}` | Thinking uniquement |
| `UserFacingReply` | Chat — strip sans `.drox-user-facing-reply` le plus récent en attente |

**Interdit** :

- Afficher JSON gate dans la section answer.
- Réutiliser un nœud DOM answer d’un strip précédent pour un nouveau tour (`chatStreamStripId` par strip).
- Routage parallèle legacy « Exploring » (supprimé — fil linéaire uniquement).

---

## 4. Protocole discussion (moteur)

Run `architect_discussion` — sortie modèle structurée :

1. (Optionnel) prose + outils si `with_reads` / `analyze`
2. Bloc `[discussion: reply]` … `[discussion: done]`
3. Moteur émet **`UserFacingReply`** (texte extrait) — **seule** source canonique pour la bulle finale en `reply_only`
4. En `with_reads` / `analyze`, le stream chat est autorisé **en parallèle** ; `UserFacingReply` reste autoritaire à la fin

---

## 5. Matrice « qui décide quoi »

| Décision | Autorité | UI ne doit pas |
|----------|----------|----------------|
| Discuss vs edit vs analyze | Gate `entry` (+ graphe) | Réinterpréter le message user |
| Lectures repo ou non | `discuss.needs_repo_facts` + `discuss.open_user_reply` | Ouvrir outils sans `start_run` adapté |
| Outils autorisés en edit | `EditTier` + tool gates (transitoire) | Afficher outils bloqués comme succès |
| Texte user-visible | `UserFacingReply` ou stream chat (discuss) | Inventer une réponse depuis Thinking |

---

## 6. Mode dev vs prod

| Flag | Effet |
|------|-------|
| `DROX_DEV_GATE_TAGS_ENABLED` | Tags orange `gateDev` / `gatePath` dans le fil |
| Prod (défaut `false`) | Gates invisibles hors Thinking ; pas de surprise visuelle |

---

## 7. Checklist PR (anti-surprise)

- [ ] Nouvelle gate → TOML + `gate-graph.json` + test `gate_engine::`
- [ ] Nouvel `START_RUN` → `gate_routes.rs` + `orchestration_run.rs` + ligne dans §1.2 ci-dessus
- [ ] Nouvel `AgentEvent` → `event.rs` + `droxChatAgentEvents.ts` + `droxChatBridge.ts` + ligne §2
- [ ] Changement affichage texte → **uniquement** `simple.js` + mise à jour §3
- [ ] Pas de heuristique prose (langue, salutation, longueur) pour router discuss/edit

---

## 8. État cible vs actuel

| Zone | Actuel | Cible |
|------|--------|-------|
| Conducteur | C1 + C2 + C3 parallèles | Graphe gates unique |
| UI texte | `simple.js` (OK) | Figé par ce contrat |
| Gates dev UI | Désactivées prod | Inchangé |
| Analyze entry | Gate `architect_analyze` | Documenté dans graphe |

---

## 9. Flux bout-en-bout — Ollama → UI

### 9.1 Vue d’ensemble

```text
Utilisateur (composer)
    → droxChatSendRun.ts : append user + agent.run (JSON-RPC)
        → drox-cli orchestration_run.rs : gate chain puis discuss/edit
            → Agent::run_with_history (drox-engine loop.rs)
                → LlmClient::stream_chat → Ollama HTTP/SSE
                → consume_stream (agent_stream.rs) : parse phases + texte
                → AgentEvent (event.rs)
            → notify agent/event (drox-cli agent_run.rs)
        → droxChatAgentHost.ts : agent/event notification
            → dispatchAgentEvent (droxChatAgentEvents.ts)
            → post message webview (droxChatBridge.ts)
    → host-message.js : handleHostMessage
        → simple.js : routeSimpleDisplayDelta / applyUserFacingReply
    → 11-markdown.js : setAssistantMarkdown → DOM
```

### 9.2 Côté Ollama / LLM

| Flux Ollama | Événement interne | `AgentEvent` émis |
|-------------|-------------------|-------------------|
| `message.thinking` (si `think: true`) | `StreamEvent::ThinkingDelta` | `PhaseEnter(internal_reasoning)` puis `TextDelta` |
| `message.content` | `StreamEvent::TextDelta` | Lignes parsées : `[phase: …]` → `PhaseEnter` ; reste → `TextDelta` |
| Fin tour | `StreamEvent::Stop` | `Stop` |

Le parseur `PhaseLineBuffer` (`agent_stream.rs`) découpe le content sur les marqueurs `[phase: reading]`, `[phase: answering]`, etc.

### 9.3 Chaîne gates (avant run discussion/edit)

1. `probe_architect_gate_chain` — rôle `architect_intent`, `minimal_gate_probe: true`
2. Chaque gate : `GateProbe` → tour LLM JSON → `GatePass` → transition graphe
3. Terminal : `GatePath { gate_path, start_run }`
4. **UI** : `orchestrationRole: architect_intent` → deltas en **Thinking** ; pas de chat user

### 9.4 Run discussion (`architect_discussion`)

1. `RoleEnter` → webview `orchestrationRole`
2. Stream live : chaque `TextDelta` → `delta` → `routeSimpleDisplayDelta`
   - thinking / gate JSON → panneau Thinking
   - prose après gates → **chat stream** (`.drox-chat-stream`, markdown incrémental)
3. Fin run : `extract_discussion_user_facing_reply` sur transcript complet
4. **`UserFacingReply`** post-run → `userFacingReply` → `applyUserFacingReply`
   - **Remplace** le stream partiel (même nœud DOM, re-render markdown final)

### 9.5 Run edit (`architect`)

1. `RoleEnter architect` → strip banner + outils work/verify
2. `TextDelta` + `[phase: answering]` → chat markdown
3. Pas de `UserFacingReply` — la réponse user = stream `answering` / phases

### 9.6 Rendu markdown (webview)

| Étape | Module | Rôle |
|-------|--------|------|
| Routage surface | `stream/display/simple.js` | Choisit Thinking vs chat |
| Peinture | `paintAssistantMarkdown` | Classe `.markdown` + `setAssistantMarkdown` |
| Parser | `markdown/11-markdown.js` | Blocs (`#`, listes, ```) + inline (`**`, liens) |
| Styles | `droxChatMvp.css` | `.msg.assistant.markdown …` |

---

*Dernière révision : alignée sur webview `simple.js` post-refonte affichage (juin 2026).*
