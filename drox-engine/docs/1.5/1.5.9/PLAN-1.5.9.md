# Plan 1.5.9 — Connexions MCP (UI + moteur)

**Version** : juin 2026  
**Base** : [1.5.8](../1.5.8/PLAN-1.5.8.md) livrée  
**Branche** : `1.5.9` · tag **`v1.5.9`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **M1** Inventaire & spec UX | 0 % | oui |
| **M2** UI Connexions MCP (adapt VS Code) | 0 % | oui |
| **M3** Pont moteur `drox-mcp` | 0 % | oui |
| **M4** Doc utilisateur + agent | 0 % | non |
| **M5** Smoke & release | 0 % | oui |
| **M6** Modes permission natifs (Ask + Analyse) | 0 % | non |

---

## Objectif

| In | Hors scope |
|----|------------|
| Section **Connexions MCP** visible et documentée (ajout, état, erreurs) | Marketplace MCP Copilot (`api.github.com/copilot/mcp_registry`) |
| Config workspace `.mcp.json` / `mcp.json` alignée moteur + workbench | Réécrire le protocole MCP |
| Toggle `drox.tools.mcp.enabled` intégré à cette section | Serveurs MCP « cloud » Microsoft obligatoires |
| Guide opérations + agent ([GUIDE-MCP-CONNEXIONS.md](GUIDE-MCP-CONNEXIONS.md)) | TUI standalone hors IDE |
| Clarifier / compléter les **modes de permission** moteur (Ask explicite, Analyse read-only) | Réécrire tout le pipeline permissions TS d’origine |

---

## Contexte — ce qui existe déjà

### VS Code (upstream, dans le fork)

| Couche | Emplacement | Rôle |
|--------|-------------|------|
| Vue **MCP Servers** | `src/vs/workbench/contrib/mcp/browser/mcpServersView.ts` | Liste, install, état, actions |
| Découverte | `workspaceDotMcpDiscovery`, `extensionMcpDiscovery` | Lit `mcp.json` / `.mcp.json` |
| Éditeur serveur | `mcpServerEditor.ts` | Détail outils / ressources |
| Customizations | `aiCustomization/embeddedMcpServerDetail.ts` | Lien chat / agent host |

La vue est aujourd’hui dans le **conteneur Extensions**, avec des chemins vers la galerie Copilot (`product.json` → `mcpRegistryDataUrl`).

### Drox (moteur)

| Couche | Emplacement | Rôle |
|--------|-------------|------|
| Hub MCP | `drox-mcp` (crate) | Client MCP, stubs dynamiques |
| Outils | `mcp__<server>__<tool>`, `list_mcp_resources`, `read_mcp_resource` | [GUIDE §6.13](../../0.0/guides/GUIDE-MOTEUR-DROX.md) |
| Setting | `drox.tools.mcp.enabled` | Active l’exposition au LLM |
| Chat settings | toggle « MCP tools » dans réglages généraux webview | On/off seulement, pas de gestion serveurs |

**Écart produit** : l’utilisateur ne voit pas **où** brancher GitHub, Postgres, browser, etc. — seulement un booléen.

### Modes de permission — écart actuel (juin 2026)

Le moteur embarque `drox-permissions` (`PermissionMode`) mais l’alignement IDE ↔ moteur est incomplet :

| Vignette IDE (1.5.9) | Valeur RPC | `PermissionMode` moteur | Comportement réel |
|----------------------|------------|-------------------------|-------------------|
| **Planifier** | `analyze` | `Plan` | Écritures **refusées** ; sortie via `exit_plan_mode` + validation utilisateur |
| **Trust Edit** | `trustEdit` | `AcceptEdits` | Écritures fichier auto-autorisées dans le workspace |
| **I'm not crazy** | `imNotCrazy` | `Default` | Outils read-only auto ; mutateurs → **`Ask`** (dialogue IDE) |

**Problèmes observés en dogfood :**

1. **Pas de variante `Ask` nommée** dans l’enum moteur — `Default` fait bien `Ask` sur les mutateurs, mais l’API / la doc parlent de « default », pas de « ask ». Les modes TS d’origine (`dontAsk`, `auto`, `bubble`) ne sont **pas portés** (`mode.rs`).
2. **Plan ≠ Analyse** — `Plan` bloque les écritures mais le system prompt reste « agent qui modifie » ; le modèle propose encore d’implémenter et appelle `exit_plan_mode`. Il n’existe **pas** de mode « audit / lecture seule » distinct (phase `[phase: analyzing]` = guidance prompt seulement, pas garde-fou permissions).
3. **Libellés UI** (corrigé en 1.5.8 polish : « Analyze » → **Planifier**) — la valeur wire `analyze` reste un alias historique vers `Plan`.

**Cible M6** : rendre ces comportements **explicites** côté moteur + vignettes, sans dupliquer la logique IDE.

---

## Vision 1.5.9

```text
Réglages Drox / barre latérale
└─ Connexions MCP          ← section dédiée (rebrand)
   ├─ Serveurs du workspace (.mcp.json)
   ├─ État : démarré / erreur / outils découverts
   ├─ Lien « Ouvrir la config »
   └─ Activer pour le moteur Drox (drox.tools.mcp.enabled)

Workbench VS Code (contrib/mcp)
└─ même registre de serveurs — pas deux vérités
```

---

## Piliers

### M1 — Spec & cartographie

| # | Tâche | Détail |
|---|--------|--------|
| M1-1 | Audit UI MCP visible aujourd’hui | Menu Extensions → MCP : visible ou masqué par `chat.agent.enabled` / `AIDisabled` ? |
| M1-2 | Décider **emplacement** | Option A : entrée **Réglages Drox** · B : vue latérale « Connexions » · C : les deux (lien) |
| M1-3 | Rédiger [GUIDE-MCP-CONNEXIONS.md](GUIDE-MCP-CONNEXIONS.md) | Parcours utilisateur + exemples serveurs |
| M1-4 | Matrice transports | `stdio`, SSE/HTTP — ce que Drox supporte en 1.5.9 |

**Critère** : maquette texte validée (pas de dev sans emplacement fixé).

### M2 — Adapter l’UI VS Code (pas réinventer)

| # | Tâche | Détail |
|---|--------|--------|
| M2-1 | **Rebrand visuel** | Titres, icônes, couleurs Drox — retirer libellés « Copilot » / galerie MS si affichés |
| M2-2 | **Désactiver ou remplacer** galerie registry Copilot | `product.json` `mcpRegistryDataUrl` → vide ou doc « ajouter manuellement » |
| M2-3 | **Rendre la section atteignable** | Commande palette `Drox: Open MCP Connections` · entrée menu Réglages Drox |
| M2-4 | Préconditions Drox | Ne pas réactiver tout `chat.agent.enabled` — seulement la couche MCP |
| M2-5 | Cohérence avec `drox.tools.mcp.enabled` | Toggle dans la même section ; état « outils masqués au modèle » explicite |

**Fichiers probables** : `contrib/mcp/browser/*`, `contrib/drox/browser/…`, `droxProductDefaultsConfiguration.ts` (ciblé).

### M3 — Pont moteur

| # | Tâche | Détail |
|---|--------|--------|
| M3-1 | Source de vérité config | `.mcp.json` racine workspace — même format que VS Code |
| M3-2 | Démarrage serveurs | Au `agent.run`, `drox-mcp` connecte les serveurs listés |
| M3-3 | Feedback UI | Erreur spawn / timeout remontée dans la section Connexions |
| M3-4 | Tests | Serveur MCP minimal (ex. `everything` ou fixture) · stubs `mcp__*` visibles dans un run |

**Critère** : un serveur ajouté via UI → visible dans un run Drox Chat sans éditer JSON à la main.

### M6 — Modes permission natifs (Ask + Analyse)

> **Non bloquant** pour la release MCP si le chantier dépasse le créneau — mais à traiter dans la branche 1.5.9 si le temps le permet.

| # | Tâche | Détail |
|---|--------|--------|
| M6-1 | **Cartographier l’existant** | `drox-permissions/src/mode.rs`, `engine.rs` (pipeline Deny → Ask → Allow), `permission_mode_from_rpc` dans `handlers.rs`, vignettes `droxChatWebview.ts` |
| M6-2 | **Mode `Ask` explicite** | Option A (minimale) : documenter que `Default` = mode Ask · Option B (recommandée) : alias `Ask` dans `PermissionMode` + RPC (`imNotCrazy` → `ask` ou conserver les deux clés) · exposer `short_title()` / JSON cohérents |
| M6-3 | **Mode `Analyze` read-only** (nouveau) | `PermissionMode` dédié **ou** flag `interactionMode` : bloquer mutateurs comme `Plan`, **sans** workflow `exit_plan_mode` obligatoire ; injecter `ANALYZE_MODE_SUPPLEMENT` au system prompt (audit, pas d’implémentation) |
| M6-4 | **Séparer Planifier vs Analyser** | UI : 3e vignette ou remplacement — **Planifier** (`Plan` + `exit_plan_mode`) vs **Analyser** (read-only pur) ; éviter la confusion `analyze` → `Plan` |
| M6-5 | **Tests moteur** | `write_tools_ask_in_ask_mode`, `write_tools_denied_in_analyze_mode`, mapping RPC, régression `applyEdits: false` côté IDE |
| M6-6 | **Doc** | Table modes dans [GUIDE-MOTEUR-DROX](../../0.0/guides/GUIDE-MOTEUR-DROX.md) · settings `drox.permissionMode` · tooltips vignettes |

**Critères d’acceptation M6** :

- [ ] Un mode **Ask** est identifiable dans l’API moteur (nom + comportement documentés), pas seulement « default ».
- [ ] Un mode **Analyse** (read-only) existe et se distingue de **Plan** (plan-then-execute).
- [ ] Les vignettes IDE reflètent les noms moteur (fini l’alias trompeur `analyze` = plan, ou documenté + migré).
- [ ] Smoke : run en Analyse → aucun `file_edit` exécuté ; run en Ask → dialogue permission sur mutateurs.

**Fichiers probables** : `drox-permissions/src/mode.rs`, `drox-engine/src/permissions.rs`, `drox-cli/src/jsonrpc/handlers.rs`, `drox-cli/src/prompts.rs` (supplément Analyse), `droxRunSettings.ts`, `droxPermissionAsk.ts`, `droxChatWebview.ts`.

### M4 — Documentation

| # | Tâche | Détail |
|---|--------|--------|
| M4-1 | Promouvoir guide → `drox-engine/docs/operations/07-MCP-CONNEXIONS.md` | À la livraison |
| M4-2 | Mettre à jour [AGENTS.md](../../operations/AGENTS.md) | § MCP + dépannage |
| M4-3 | [00-BUILD-REFERENCE](../../operations/00-BUILD-REFERENCE.md) | Lien si pertinent |

### M5 — Release

- [ ] `droxVersion` **1.5.9**
- [ ] Smoke : ajout serveur · run agent · outil MCP appelé
- [ ] Notes release OR · ship win puis linux ([operations](../../operations/README.md))

---

## Exemple config (référence)

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "<token>" }
    }
  }
}
```

Fichier : `<workspace>/.mcp.json` ou `mcp.json`.

---

## Critères d'acceptation

- [ ] Section **Connexions MCP** accessible sans login GitHub
- [ ] Au moins **un** serveur MCP ajouté depuis l’UI ou doc guidée
- [ ] Outils exposés au modèle quand `drox.tools.mcp.enabled` = true
- [ ] Aucune dépendance à la galerie Copilot pour le parcours nominal
- [ ] Doc utilisateur + agent à jour
- [ ] *(M6, si livré)* Modes Ask et Analyse documentés et testés (voir pilier M6)

---

## Liens

- [README 1.5.9](README.md)
- [PLAN 1.5.4](../1.5.4/PLAN-1.5.4.md)
- [PLAN 1.5.10](../1.5.10/PLAN-1.5.10.md) — Agents Window (chantier suivant)
