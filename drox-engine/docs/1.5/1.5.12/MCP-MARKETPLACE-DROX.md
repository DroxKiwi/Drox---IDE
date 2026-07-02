# Marketplace MCP Drox — spec (curated · open source)

**Version** : juin 2026 · **1.5.12** (cadrage) · impl cible **1.5.13+**  
**PLAN** : [PLAN-1.5.12.md](PLAN-1.5.12.md) § P7  
**Brainstorm moteur** : [#16 Connexions MCP](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md)

---

## Problème

L’écran **Agent Customizations → MCP Servers** propose déjà un browse *« Search MCP marketplace… »*, mais affiche **No MCP servers available** car :

- `product.json` n’a pas de `mcpGallery.serviceUrl`
- `defaultChatAgent.mcpRegistryDataUrl` est vide (registry **GitHub Copilot** volontairement neutralisé)
- Drox ne doit **pas** réutiliser le catalogue Microsoft sans compte GitHub

L’utilisateur doit pouvoir **découvrir et installer** des serveurs MCP utiles, sans ouvrir la porte à **n’importe quelle** connexion distante ou binaire opaque.

---

## Vision

Un **registre MCP Drox** : catalogue **curated**, **open source first**, installable en un clic depuis la fenêtre Agents, branché sur la **même** config que le moteur `drox.exe` (`drox-mcp`).

```text
┌─────────────────────────────────────────────────────────┐
│  Customizations → MCP Servers                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 🔍 Search Drox MCP catalog…                      │   │
│  │  • filesystem (OSS · MIT) · @modelcontextprotocol  │   │
│  │  • git (OSS · MIT)                               │   │
│  │  • …                                             │   │
│  └─────────────────────────────────────────────────┘   │
│  Install → workspace .mcp.json → drox-mcp au run       │
└─────────────────────────────────────────────────────────┘
```

---

## Principes

| # | Principe | Implication |
|---|----------|-------------|
| 1 | **OSS first** | Licence OSI + repo public obligatoires pour entrer au catalogue |
| 2 | **Curated** | Ajout par PR/review Drox — pas de marketplace ouvert type « soumettez n’importe quoi » |
| 3 | **Pas de remote sauvage** | Pas d’URL SSE/WebSocket arbitraire proposée en un clic depuis la galerie |
| 4 | **Versions épinglées** | Coordonnées npm/pypi/docker **fixes** dans le manifest (reproductibilité + audit) |
| 5 | **Transparence** | Fiche serveur : licence, repo, publisher, outils exposés |
| 6 | **Manuel = avancé** | Édition directe `.mcp.json` hors galerie → bannière « non curated » |
| 7 | **Sans GitHub login** | Registre hébergé Drox / GitHub public static — pas `copilot/mcp_registry` |

---

## Ce qu’on autorise / interdit

### ✅ Depuis la galerie Drox

- Packages **npm** open source épinglés (ex. `@modelcontextprotocol/server-*`)
- Packages **PyPI** OSS épinglés
- Images **Docker/OCI** OSS avec Dockerfile public
- Binaires **uniquement** si build reproductible documenté + repo public

### 🚫 Depuis la galerie (jamais en un clic)

- MCP **remote** vers endpoint tiers non audité
- Serveurs **propriétaires** sans source
- Packages npm **latest** flottant (`npx -y foo@latest` sans pin)
- OAuth / tokens vers services cloud sans doc claire dans la fiche

### 🔵 Hors galerie (power user)

- Fichier `.mcp.json` ou `.drox/mcp.json` édité à la main
- UI : liste « Installed (manual) » + tooltip de prudence
- Option future : `drox.mcp.allowUncuratedServers` (default **false** en prod)

---

## Checklist curation (par entrée catalogue)

- [ ] Licence **OSI-approved** (MIT, Apache-2.0, BSD, GPL compatible usage IDE…)
- [ ] `repositoryUrl` public (GitHub/GitLab/Codeberg…)
- [ ] README expliquant outils et permissions réseau/fichiers
- [ ] Version package **épinglée** dans le manifest gallery
- [ ] Mainteneur identifié (org MCP officielle ou projet connu)
- [ ] Smoke install + liste outils sur Windows **et** Linux (WSL si pertinent)
- [ ] Pas de téléphone home non documenté
- [ ] Review Drox (PR sur repo manifest)

Badge UI proposé : **Drox Verified OSS**.

---

## Technique — réutiliser le chassis VS Code

Le workbench implémente déjà le protocole **MCP Gallery** :

| Couche | Fichier / config |
|--------|------------------|
| UI browse | `mcpListWidget.ts` |
| Manifest | `mcpGalleryManifestService.ts` |
| Product | `product.mcpGallery.serviceUrl` |
| Override | `chat.mcp.gallery.serviceUrl` |
| Install | `mcpWorkbenchService.ts` |
| Découverte locale | `workspaceDotMcpDiscovery.ts` |
| Accès global | `mcpAccessConfig` · `IAllowedMcpServersService` |

**Action Drox (1.5.13)** :

```json
// product.json (extrait cible)
"mcpGallery": {
  "serviceUrl": "https://…/drox-mcp-registry"
}
```

+ defaults dans `droxProductDefaultsConfiguration.ts` :

```json
"chat.mcp.gallery.enabled": true
```

Le manifest suit le format VS Code (`IMcpGalleryManifest` · `/v0.1/servers`).

---

## Pont moteur `drox.exe`

Aligné brainstorm **#16 M3** :

1. Serveur installé via galerie → entrée dans `.mcp.json` workspace
2. Workbench MCP démarre le processus (stdio)
3. Au `agent.run`, **drox-mcp** charge la **même** config
4. Outils exposés : `mcp__<server>__<tool>` quand `drox.tools.mcp.enabled` = true

Une seule vérité disque — pas deux registres parallèles.

---

## Catalogue initial (draft)

| Id | Display | Package / commande | Licence | Notes |
|----|---------|-------------------|---------|-------|
| `filesystem` | Filesystem | `@modelcontextprotocol/server-filesystem@…` | MIT | Accès chemins workspace |
| `git` | Git | package MCP git OSS épinglé | MIT | Historique, pas push sans consent |
| `fetch` | Fetch | serveur fetch OSS épinglé | MIT | HTTP read-only |
| `memory` | Memory | serveur memory OSS | MIT | Optionnel · données locales |

Liste à valider en review — objectif **5–10** entrées pour 1.5.13, pas centaines.

---

## Gouvernance

1. Repo **`drox-mcp-registry`** (ou dossier dans OR) : JSON manifest + README par serveur
2. Ajout : PR + checklist ci-dessus + smoke CI
3. Retrait : CVE / abandon / licence incompatible
4. Releases manifest versionnées (semver) consommables par `droxVersion`

---

## Phases & critères done

| Phase | Done quand |
|-------|------------|
| **P7-0** (1.5.12) | Ce doc + PLAN P7 validés |
| **P7-1** | Manifest hébergé + `product.mcpGallery` |
| **P7-2** | Marketplace non vide · install smoke |
| **P7-3** | Run Drox voit outils `mcp__*` |
| **P7-4** | Process gouvernance documenté ops |

---

## Liens

- [PLAN 1.5.12](PLAN-1.5.12.md)
- [AUDIT Agents Window](AUDIT-COPILOT-AGENTS-WINDOW.md)
- [Brainstorm #16 MCP](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md)
- [GUIDE moteur § MCP](../../0.0/guides/GUIDE-MOTEUR-DROX.md)
