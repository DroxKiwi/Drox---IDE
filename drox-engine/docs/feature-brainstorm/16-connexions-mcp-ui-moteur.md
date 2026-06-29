# Idée 16 — Connexions MCP (UI workbench + moteur Drox)

**Statut** : idée brute (brainstorm) — **reporté** depuis le périmètre release 1.5.11  
**Date** : juin 2026  
**Origine** : plan MCP initialement prévu en release 1.5.11 (juin 2026), reporté au brainstorm.

---

## Résumé

Exposer une **section Connexions MCP** claire dans Drox : réutiliser le chassis VS Code (`contrib/mcp`), le rebrandre, et le **relier au moteur** `drox-mcp` (outils `mcp__*`). Clarifier les **modes de permission** (Ask explicite, Analyse read-only vs Planifier).

**Non bloquant** pour la release **1.5.11** (Agents Window native) — à promouvoir en chantier versionné quand priorisé.

---

## Problème

| Symptôme | Cause |
|----------|--------|
| Pas de gestion serveurs visible | Seul `drox.tools.mcp.enabled` dans le chat |
| Vue MCP VS Code peu atteignable | `chat.agent.enabled` off · galerie Copilot |
| Deux stacks | Workbench MCP vs moteur `drox-mcp` pas unifiés côté UX |

Le moteur expose déjà `mcp__<server>__<tool>`, `list_mcp_resources`, `read_mcp_resource` ([GUIDE moteur §6.13](../0.0/guides/GUIDE-MOTEUR-DROX.md)).

---

## Vision

```text
Réglages Drox / barre latérale
└─ Connexions MCP
   ├─ Serveurs workspace (.mcp.json)
   ├─ État : démarré / erreur / outils découverts
   └─ Activer pour le moteur (drox.tools.mcp.enabled)

contrib/mcp (VS Code)
└─ même registre — pas deux vérités
```

---

## Pistes techniques

### Inventaire existant

| Couche | Emplacement |
|--------|-------------|
| Vue MCP Servers | `src/vs/workbench/contrib/mcp/browser/` |
| Hub moteur | `drox-mcp` (crate) |
| Setting | `drox.tools.mcp.enabled` |

### Piliers (ancien plan M1–M6)

| Pilier | Contenu |
|--------|---------|
| **M1** | Spec UX · emplacement (Réglages Drox vs vue latérale) |
| **M2** | Rebrand UI · désactiver galerie Copilot · commande `Drox: Open MCP Connections` |
| **M3** | Pont `.mcp.json` → `drox-mcp` au `agent.run` · feedback erreurs spawn |
| **M4** | Doc ops `07-MCP-CONNEXIONS.md` |
| **M5** | Smoke release |
| **M6** | Modes `Ask` / `Analyze` read-only explicites (`drox-permissions`) |

### Exemple config

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

### Parcours utilisateur cible

1. Ouvrir **Drox → Connexions MCP**
2. Ajouter un serveur (formulaire ou éditer `.mcp.json`)
3. Vérifier état **Connecté** + liste d’outils
4. Activer **Exposer au modèle**
5. Run Drox Chat ou **Agents Window** — outils `mcp__…` disponibles

### Dépannage

| Symptôme | Piste |
|----------|--------|
| Aucun outil `mcp__*` | `drox.tools.mcp.enabled` = false |
| Erreur spawn | PATH Windows vs WSL pour `npx` |
| Galerie Copilot | `product.json` `mcpRegistryDataUrl` à neutraliser |

---

## Hors scope

- Marketplace MCP Copilot (`api.github.com/copilot/mcp_registry`)
- Réécrire le protocole MCP
- Serveurs cloud Microsoft obligatoires

---

## Lien avec Agents Window (1.5.11)

Le panneau **Customizations → MCP Servers** de la fenêtre Agents natif pourra consommer la **même** config `.mcp.json` une fois ce chantier livré. Voir [PLAN 1.5.11 Agents](../1.5/1.5.11/PLAN-1.5.11.md) phase P4.

---

## Critères de promotion (idée → release)

- [ ] Section accessible sans login GitHub
- [ ] Un serveur MCP ajouté depuis UI ou doc guidée
- [ ] Outils exposés quand `drox.tools.mcp.enabled` = true
- [ ] Doc utilisateur + agent à jour

---

## Liens

- [Hub brainstorm](README.md)
- [PLAN 1.5.11 Agents Window](../1.5/1.5.11/PLAN-1.5.11.md)
- [13-agents-window-kdds-drox.md](13-agents-window-kdds-drox.md)
- [GUIDE moteur § MCP](../0.0/guides/GUIDE-MOTEUR-DROX.md)
