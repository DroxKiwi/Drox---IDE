# 1.5.23 — Brancher Explore (`task`) dans Drox IDE

**Parent** : [README 1.5.23](README.md)  
**Statut** : 🟢 **câblé** · défaut ON + gate L2 · smoke manuel / release note restants  
**Origine** : reporté depuis [1.5.22 PLAN](../1.5.22/PLAN-SUBAGENTS-EXPLORE-IDE.md)  
**Pédagogie** : [docs/pedagogie/11-mcp-et-explore.md](../../pedagogie/11-mcp-et-explore.md)  
**Réf. moteur** : [mcp-and-subagents.md](../../engine/mcp-and-subagents.md)

## Pourquoi maintenant

Les **sub-agents Explore** existent déjà côté moteur (`task` + `EngineSubagentExecutor` + palette read-only).  
Dans l’IDE produit, le setting / bridge n’envoie pas `subagentsEnabled` → Explore reste **invisible**.

C’est le gain produit le plus direct après le polish dogfood.

## Constat

| Couche | État |
|--------|------|
| Moteur `task` + `EngineSubagentExecutor` + tools Explore | ✅ |
| RPC `subagentsEnabled` / maxIterations / maxConcurrent | ✅ |
| Défaut produit | **on** (`drox.subagents.enabled`) × L2 `standard`/`full` |
| Extension legacy `drox-engine/extension-vscode` | Settings + envoi params |
| Fork IDE `src/vs/workbench/contrib/drox` | ✅ settings + bridge + gate L2 + cartes chat / Agents |

## Objectif produit

Rendre Explore **on par défaut**, encadré par la régulation :

1. Settings `drox.subagents.enabled` (**default `true`**, kill-switch) + `maxIterations` / `maxConcurrent`.  
2. Bridge `agent.run` : passer `subagentsEnabled` (et plafonds) depuis les settings.  
3. **Couche régulation** : L2 ∈ { `standard`, `full` } — pas seulement le toggle.  
4. Smoke : défaut / L2 ok → le modèle voit `task` → Explore renvoie un `report` ; master OFF ou L2 `core` → pas de `task`.  
5. UI minimale chat : carte / événement « Explore » lisible (start / done / report).  
6. Doc courte settings + aligner pédagogie §11.

## Lien régulation (décision produit)

Oui : Explore doit être une **surface régulée**, pas un interrupteur isolé.

| Couche | Rôle proposé |
|--------|----------------|
| **Master** `drox.subagents.enabled` | Kill-switch (**défaut ON**). Si OFF → jamais de `task`, même en L2 `full`. |
| **L2 Tool surface** | Qui *voit* `task` : typ. **pas** en `core` ; **oui** en `standard` / `full` (quand master ON). Cohérent avec allowlist actuelle (`glob`/`grep`… déjà L2). |
| **L3 Directive** | En `guided` / `assertive` : nudge « préfère `task`/explore si scope large » (**aligné Cursor**). |
| **L5 Retrieval** (optionnel) | Posture `aggressive` peut *encourager* Explore ; ne remplace pas L2. |
| **Scoring** | Signaler usage Explore (`usedExploreTask`) — stress L2 si Explore échoue en boucle ; bonus / neutre si gros analyzing réussi via Explore. |

**Règle de composition (v1)** :

```text
subagentsEnabled_run = drox.subagents.enabled
                     && L2 ∈ { standard, full }   // ou full-only si on veut plus strict
```

Pas de nouveau levier L6 : Explore = **outil** dans la surface L2 + master setting.

**Policy Cursor (1.6.x realign)** : pas de spawn auto à seuil de tokens. Le parent **décide** via `task` ; déclencheurs = (1) description outil when/when-not, (2) supplement system quand enabled, (3) playbook `analyzing` + nudge, (4) annex L3.

## Hors scope (cette fiche)

- Nouveaux types de sous-agents au-delà de `explore`.  
- Parallélisme agressif (garder `maxConcurrent: 1` par défaut sauf dogfood).  
- Remplacer l’agent parent par une flotte de workers.  
- Nouveau levier régulation dédié « L6 Subagents ».

## Checklist

- [x] Déclarer `drox.subagents.*` dans `droxConfiguration` / contribution IDE  
- [x] Lire settings dans le service run / `droxAgentRunBridge`  
- [x] Remplir `AgentRunParams.subagents_*` à chaque run  
- [x] Gate régulation : master ON × L2 ∈ { standard, full } (`droxSubagentsEnabledForRun`)  
- [x] Catalogue outil `task` + allowlist L2 standard  
- [x] Policy Cursor : description `task` when/when-not + `SUBAGENTS_EXPLORE_SUPPLEMENT` + L3 / analyzing nudge  
- [ ] Vérifier `register_subagent_task` + executor (log « sous-agents activés ») — smoke moteur  
- [x] Rendu chat des events Explore (carte collapsible webview)  
- [x] Agents UI : carte sous-agent (`toolSpecificData.kind: 'subagent'`) + replay  
- [ ] Smoke manuel documenté (ON / OFF)  
- [ ] Note release / CLOSURE

## Liens code

| Zone | Chemin |
|------|--------|
| Settings legacy | `drox-engine/extension-vscode/package.json` (`drox.subagents.*`) |
| Lecture legacy | `drox-engine/extension-vscode/src/toolSettings.ts` |
| Handlers RPC | `drox-engine/drox/crates/drox-cli/src/jsonrpc/` |
| Tool `task` | `drox-engine/drox/crates/drox-tools/src/simple/task.rs` |
| Exécuteur | `drox-engine/drox/crates/drox-engine/src/subagent/` |
| IDE bridge | `src/vs/workbench/contrib/drox/common/droxAgentRunBridge.ts` |
| Config IDE | `src/vs/workbench/contrib/drox/common/droxConfiguration.ts` |
| Wire Explore | `src/vs/workbench/contrib/drox/common/chat/droxExploreToolWire.ts` |
| Carte webview | `browser/media/droxChat/stream/tools/exploreCard.js` |
| Agents UI | `browser/agents/droxAgentsChatSink.ts` → `toolSpecificData.kind: 'subagent'` |

## Ordre suggéré vs PF

1. **Explore** — câblage + smoke (rapide, fort impact).  
2. **PF** — cadrage archi puis MVP (plus ouvert / plus long).
