# 1.5.21 — Brancher Explore (`task`) dans Drox IDE

**Priorité maj** : **#2** (après [ARCHITECTURE-CODEBASE-INDEX](ARCHITECTURE-CODEBASE-INDEX.md))  
**Statut** : 📋 à faire · moteur déjà prêt, IDE non câblé  
**Parent** : [README 1.5.21](README.md)  
**Pédagogie** : [docs/pedagogie/11-mcp-et-explore.md](../../pedagogie/11-mcp-et-explore.md)  
**Réf. moteur** : [mcp-and-subagents.md](../../engine/mcp-and-subagents.md)

## Constat (main actuelle)

| Couche | État |
|--------|------|
| Moteur `task` + `EngineSubagentExecutor` + palette Explore read-only | ✅ implémenté |
| RPC `subagentsEnabled` / `subagentsMaxIterations` / `subagentsMaxConcurrent` | ✅ dans `protocol.rs` + `handlers.rs` |
| Défaut moteur | **off** (`unwrap_or(false)`) |
| Extension legacy `drox-engine/extension-vscode` | Setting `drox.subagents.enabled` (défaut false) + envoi params |
| Fork IDE `src/vs/workbench/contrib/drox` | ❌ pas de `drox.subagents.*` ; `subagentsEnabled` non envoyé au run → Explore invisible |

Donc : **fonctionne si on active et câble** ; **inutilisable out-of-the-box** dans l’IDE produit actuel.

## Objectif produit 1.5.21

Rendre Explore **opt-in** (ou défaut produit à trancher) depuis Drox IDE :

1. Settings `drox.subagents.enabled` (+ maxIterations / maxConcurrent) dans la config produit / contribution Drox.
2. Bridge `agent.run` : passer `subagentsEnabled` (et plafonds) depuis les settings workspace.
3. Smoke : activer → le modèle voit `task` → un Explore renvoie un `report` ; désactiver → pas de `task` / erreur claire.
4. Doc utilisateur courte (settings) + aligner la pédagogie 11 (« activable dans l’IDE depuis 1.5.21 »).

Hors scope de cette fiche : nouveaux types de sous-agents au-delà de `explore` ; parallélisme agressif (garder défaut `maxConcurrent: 1` sauf dogfood).

## Checklist technique

- [ ] Déclarer settings dans le package / configuration Drox IDE (miroir extension-vscode)
- [ ] Lire settings dans le service run / `droxAgentRunBridge` (ou équivalent)
- [ ] Remplir `AgentRunParams.subagents_*` à chaque run
- [ ] Vérifier que `register_subagent_task` + executor sont bien déclenchés (log `sous-agents activés`)
- [ ] Test unitaire ou smoke manuel documenté
- [ ] Note release / CLOSURE quand livré

## Liens code

| Zone | Chemin |
|------|--------|
| Settings extension legacy | `drox-engine/extension-vscode/package.json` (`drox.subagents.*`) |
| Lecture settings legacy | `drox-engine/extension-vscode/src/toolSettings.ts` (`getSubagentSettings`) |
| Handlers RPC | `drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs` |
| Tool `task` | `drox-engine/drox/crates/drox-tools/src/simple/task.rs` |
| Exécuteur | `drox-engine/drox/crates/drox-engine/src/subagent.rs` |
| IDE bridge (à étendre) | `src/vs/workbench/contrib/drox/common/droxAgentRunBridge.ts` (+ run settings) |
