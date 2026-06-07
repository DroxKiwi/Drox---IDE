# Idée 13 — S’approprier l’Agents Window VS Code (marque KDDS / Drox)

**Statut** : idée brute (brainstorm)  
**Date** : 2026-06-07  
**Auteur** : produit / confusion marque

---

## Résumé

Le fork embarque aujourd’hui **deux expériences agent distinctes** :

1. **Drox Chat** — moteur Rust local (`drox.exe`), webview `contrib/drox`, Ollama / API locale.
2. **Agents Window** — fenêtre VS Code séparée (`vs/sessions/`), bouton titlebar **« Open in Agents »**, auth **GitHub Copilot**, Skills / MCP / Plugins Microsoft.

Objectif : **ne pas réinventer** toute l’UI sessions de zéro, mais **réutiliser le chassis** Agents Window (layout chat-first, liste sessions, Changes/Files, customizations) en le **rebranchant sur le moteur Drox** et en le **rebrandant KDDS** — une seule histoire produit, zéro écran « Sign in to Copilot » pour l’usage nominal.

---

## Problème actuel

| Symptôme | Cause |
|----------|--------|
| Bouton **Open in Agents** dans le titlebar | Contribution upstream `OpenWorkspaceInAgentsContribution` (`agentSessionsActions.ts`) |
| Écran login GitHub / Google / Apple | Provider par défaut `CopilotChatSessionsProvider` (`default-copilot`) |
| Skills, MCP marketplace, Hooks Copilot | Couche `vs/sessions/contrib/` + extension `github.copilot-chat` |
| Utilisateur pense que Drox = copie Agents | **Aucun lien code** `vs/sessions` ↔ `drox-engine` — coexistence héritée du fork VS Code |
| Chat Drox = webview auxiliaire ; Agents = autre fenêtre | Deux paradigmes UX, deux stacks LLM |

Références code :

- Agents Window : `src/vs/sessions/` — [SESSIONS.md](../../../src/vs/sessions/SESSIONS.md)
- Open in Agents : `workbench.action.openWorkspaceInAgentsWindow`
- Drox (isolé) : `src/vs/workbench/contrib/drox/` + `drox-engine/drox/`

---

## Vision produit (KDDS)

### Une fenêtre, un moteur

```text
┌─ Drox Agents (KDDS) ────────────────────────────────────────┐
│ Sessions          │  Fil agent (thinking / tools / answer)  │
│ · site-kdds       │                                         │
│ · drox-engine     │  Moteur : drox.exe (role_split)         │
│                   │  LLM    : Ollama / drox.server          │
│ Customizations    │                                         │
│ · Instructions    ├─────────────────────────────────────────┤
│ · Skills (Drox)   │  Changes │ Files                        │
│ · MCP (drox-mcp)  │  (workspace réel)                       │
└───────────────────┴─────────────────────────────────────────┘
```

- **Marque** : titre fenêtre, icône, couleurs KDDS — pas le hex Copilot.
- **Auth** : aucune pour le chemin local ; option future compte KDDS **sans** imposer GitHub.
- **Customizations** : mapper Skills/Instructions Drox existants (prompts `drox-cli/prompts/`, `.drox/skills/`) au panneau latéral Agents au lieu du catalogue Copilot.

### Relation avec le chat actuel

| Option | Description |
|--------|-------------|
| **A — Remplacement** | Drox Chat webview devient secondaire ; Agents Window = surface principale |
| **B — Parité** | Les deux consomment le même provider Drox ; choix utilisateur |
| **C — Convergence progressive** | MVP provider Drox dans Agents ; webview conservée jusqu’à parité UX |

Recommandation brainstorm : **C** (risque moindre, dogfood incrémental).

---

## Pistes techniques

### 1. Provider sessions Drox (cœur)

Créer `DroxSessionsProvider` dans `vs/sessions/contrib/providers/drox/` :

- Implémente `ISessionsProvider` (voir [SESSIONS.md](../../../src/vs/sessions/SESSIONS.md))
- `id` : `drox` ou `kdds-drox`
- Lance / réutilise `IDroxEngineService` (JSON-RPC `agent.run`, events `agent/event`)
- Sessions = fichiers `.drox/sessions/*.jsonl` + journal UI replay (déjà en place côté IDE)
- **Pas** de dépendance `github.copilot-chat` pour le run nominal

Réutilise l’agrégation `SessionsManagementService` au lieu de réécrire onglets Sessions / Changes / Files.

### 2. Désactivation / repli Copilot

| Levier | Effet |
|--------|--------|
| Ne pas enregistrer `CopilotChatSessionsProvider` en build Drox | Fenêtre Agents vide ou policy blocked |
| `product.json` : retirer / vider `chatExtensionId` | Réduit dépendance Copilot (impact large — à cadrer) |
| `sessionsWindowAllowedExtensions` | Whitelist extensions autorisées dans Agents Window |
| Masquer `Open in Agents` tant que provider Drox absent | Évite confusion (quick win déjà identifié) |

### 3. Rebranding KDDS

- Remplacer chaînes `Agent` / `Copilot` dans `vs/sessions/contrib/` visibles utilisateur (nls Drox)
- Icône titlebar + welcome : assets `resources/drox/`
- `product.json` : `nameLong`, `win32AppUserModelId` déjà KDDS — aligner libellés Agents Window
- Onboarding : remplacer « Build with AI Agents » (Copilot) par parcours Drox local

### 4. Customizations (Skills, MCP, Instructions)

| Concept Agents VS Code | Équivalent Drox existant / à créer |
|------------------------|-------------------------------------|
| Instructions | System prompts `01_core.md`, presets `EngineTuning` |
| Skills | `skill_list` / `skill_read`, dossier skills workspace |
| MCP Servers | `drox-mcp`, réglage `drox.tools.mcp.enabled` |
| Hooks | Non — futur `drox hooks` ou réutilisation hooks Cursor-style |
| Plugins | Hors scope — marketplace Copilot non pertinent |

### 5. Ce qu’on ne copie **pas**

- Sandbox terminal `chat.agent.sandbox.*` (politique Microsoft) → permissions Drox (`analyze` / `trustEdit` / `imNotCrazy`)
- Modèles cloud Copilot → `drox.architect.model` / Ollama
- Gate chain TOML / backpack (déjà retirés côté Drox 1.3.2)

---

## Phases suggérées (MVP → appropriation)

| Phase | Livrable | Critère done |
|-------|----------|--------------|
| **P0** | Doc + masquer « Open in Agents » si Copilot requis | Plus de fausse porte d’entrée |
| **P1** | `DroxSessionsProvider` minimal : nouvelle session → `agent.run` → fil chat | Un run « Salut » OK sans login GitHub |
| **P2** | Rebrand KDDS (titres, welcome, icônes) | Aucune mention Copilot à l’écran nominal |
| **P3** | Customizations Drox (skills, instructions) dans panneau latéral | Parité fonctionnelle utile |
| **P4** | Décision A/B/C sur webview `contrib/drox` | Une stratégie produit documentée |

---

## Questions ouvertes

1. **Fenêtre séparée vs panneau intégré** — Les utilisateurs KDDS veulent-ils vraiment deux fenêtres Electron ou un Agents layout dans l’IDE classique ?
2. **Couverture `vs/sessions`** — Maintenir le merge upstream VS Code sur cette couche coûte cher ; fork partiel ou contribution provider seule ?
3. **Licence / attribution** — Rebrand vs code Microsoft sous MIT — charte legal NOTICE déjà en place ?
4. **Copilot optionnel** — Garder Agents+Copilot pour utilisateurs GitHub, ou build Drox **sans** extension Copilot ?
5. **Parité UX** — Timeline thinking, executor rails, export `chat.txt` : tout porter dans Agents UI ou sous-ensemble MVP ?

---

## Liens

- [UI Phase 1 — chat natif](../0.0/ide/UI-PHASE1-CHAT-NATIF.md) — vision Cursor-like (auxiliary bar)
- [CONDUCTEUR-CODE 1.3.2](../1.3/1.3.2/CONDUCTEUR-CODE.md) — moteur actuel
- [1.3.3 — trois piliers](../1.3/1.3.3/README.md) — index / graphe / fast path (complémentaire, pas concurrent)
- [10 — Paramétrage prompts & strictesse](10-parametrage-prompts-strictesse.md) — customizations côté moteur
- Upstream : `src/vs/sessions/SESSIONS.md`, `COPILOT_CHAT_SESSIONS_PROVIDER.md`

---

## Critères de promotion (idée → chantier)

- [ ] Décision produit : Agents Window = **surface principale** ou **complément** du webview Drox
- [ ] Spike technique : `DroxSessionsProvider` prototype (1 session, 1 run, events relayés)
- [ ] Stratégie Copilot documentée (désactiver vs coexister)
- [ ] Maquettes rebrand KDDS validées
- [ ] Tests : pas de régression `drox.exe` ; smoke Agents sans réseau GitHub
