# Plan 1.5.7 — Connexions MCP (UI + moteur)

**Version** : juin 2026  
**Base** : [1.5.6](../1.5.6/PLAN-1.5.6.md)  
**Branche** : `1.5.7` · tag **`v1.5.7`** sur `Drox---IDE---OR`

### État d'avancement

| Pilier | Avancement | Bloquant |
|--------|------------|----------|
| **M1** Inventaire & spec UX | 0 % | oui |
| **M2** UI Connexions MCP (adapt VS Code) | 0 % | oui |
| **M3** Pont moteur `drox-mcp` | 0 % | oui |
| **M4** Doc utilisateur + agent | 0 % | non |
| **M5** Smoke & release | 0 % | oui |

---

## Objectif

| In | Hors scope |
|----|------------|
| Section **Connexions MCP** visible et documentée (ajout, état, erreurs) | Marketplace MCP Copilot (`api.github.com/copilot/mcp_registry`) |
| Config workspace `.mcp.json` / `mcp.json` alignée moteur + workbench | Réécrire le protocole MCP |
| Toggle `drox.tools.mcp.enabled` intégré à cette section | Serveurs MCP « cloud » Microsoft obligatoires |
| Guide opérations + agent ([GUIDE-MCP-CONNEXIONS.md](GUIDE-MCP-CONNEXIONS.md)) | TUI standalone hors IDE |

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

---

## Vision 1.5.7

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
| M1-4 | Matrice transports | `stdio`, SSE/HTTP — ce que Drox supporte en 1.5.7 |

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

### M4 — Documentation

| # | Tâche | Détail |
|---|--------|--------|
| M4-1 | Promouvoir guide → `drox-engine/docs/operations/07-MCP-CONNEXIONS.md` | À la livraison |
| M4-2 | Mettre à jour [AGENTS.md](../../operations/AGENTS.md) | § MCP + dépannage |
| M4-3 | [00-BUILD-REFERENCE](../../operations/00-BUILD-REFERENCE.md) | Lien si pertinent |

### M5 — Release

- [ ] `droxVersion` **1.5.7**
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

---

## Liens

- [README 1.5.7](README.md)
- [PLAN 1.5.4](../1.5.4/PLAN-1.5.4.md)
- [PLAN 1.5.8](../1.5.8/PLAN-1.5.8.md) — Agents Window (chantier suivant)
