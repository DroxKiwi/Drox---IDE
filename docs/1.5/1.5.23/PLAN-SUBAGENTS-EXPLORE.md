# 1.5.23 — Brancher Explore (`task`) dans Drox IDE

**Parent** : [README 1.5.23](README.md)  
**Statut** : 🟢 **câblé** · opt-in IDE + Agents · smoke manuel / release note restants  
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
| Défaut moteur | **off** (opt-in) |
| Extension legacy `drox-engine/extension-vscode` | Settings + envoi params |
| Fork IDE `src/vs/workbench/contrib/drox` | ✅ settings + bridge + gate L2 + cartes chat / Agents |

## Objectif produit

Rendre Explore **opt-in** (défaut off au départ, ou défaut on après smoke — à trancher au dogfood) :

1. Settings `drox.subagents.enabled` (+ `maxIterations` / `maxConcurrent`) dans la config Drox IDE.  
2. Bridge `agent.run` : passer `subagentsEnabled` (et plafonds) depuis les settings.  
3. **Couche régulation** (voir ci-dessous) — pas seulement un toggle brut.  
4. Smoke : ON → le modèle voit `task` → Explore renvoie un `report` ; OFF → pas de `task` / erreur claire.  
5. UI minimale chat : carte / événement « Explore » lisible (start / done / report).  
6. Doc courte settings + aligner pédagogie §11.

## Lien régulation (décision produit)

Oui : Explore doit être une **surface régulée**, pas un interrupteur isolé.

| Couche | Rôle proposé |
|--------|----------------|
| **Master** `drox.subagents.enabled` | Kill-switch user / produit (sécurité, coût). Si OFF → jamais de `task`, même en L2 `full`. |
| **L2 Tool surface** | Qui *voit* `task` : typ. **pas** en `core` ; **oui** en `standard` / `full` (quand master ON). Cohérent avec allowlist actuelle (`glob`/`grep`… déjà L2). |
| **L3 Directive** (optionnel v1.1) | En `guided` / `assertive` + phase analyzing : nudge « préfère `task`/explore si scope large ». |
| **L5 Retrieval** (optionnel) | Posture `aggressive` peut *encourager* Explore ; ne remplace pas L2. |
| **Scoring** | Signaler usage Explore (`usedExploreTask`) — stress L2 si Explore échoue en boucle ; bonus / neutre si gros analyzing réussi via Explore. |

**Règle de composition (v1)** :

```text
subagentsEnabled_run = drox.subagents.enabled
                     && L2 ∈ { standard, full }   // ou full-only si on veut plus strict
```

Pas de nouveau levier L6 : Explore = **outil** dans la surface L2 + master setting.

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
| Exécuteur | `drox-engine/drox/crates/drox-engine/src/subagent.rs` |
| IDE bridge | `src/vs/workbench/contrib/drox/common/droxAgentRunBridge.ts` |
| Config IDE | `src/vs/workbench/contrib/drox/common/droxConfiguration.ts` |
| Wire Explore | `src/vs/workbench/contrib/drox/common/chat/droxExploreToolWire.ts` |
| Carte webview | `browser/media/droxChat/stream/tools/exploreCard.js` |
| Agents UI | `browser/agents/droxAgentsChatSink.ts` → `toolSpecificData.kind: 'subagent'` |

## Ordre suggéré vs PF

1. **Explore** — câblage + smoke (rapide, fort impact).  
2. **PF** — cadrage archi puis MVP (plus ouvert / plus long).
