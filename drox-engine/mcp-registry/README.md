# Drox MCP Registry (curated · open source)

Catalogue MCP **curated** pour Drox IDE 1.5.12+. Format [MCP Gallery v0.1](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/registry/schema.md) consommé par `product.mcpGallery.serviceUrl`.

## Entrées

| Serveur | Package | Licence |
|---------|---------|---------|
| Filesystem | `@modelcontextprotocol/server-filesystem` | MIT |
| Memory | `@modelcontextprotocol/server-memory` | MIT |
| Fetch | `mcp-server-fetch` (PyPI) | MIT |
| Git | `mcp-server-git` (PyPI) | MIT |
| Sequential Thinking | `@modelcontextprotocol/server-sequential-thinking` | MIT |

Versions **épinglées** dans `v0.1/servers`. Ajout / retrait via PR + checklist dans [MCP-MARKETPLACE-DROX.md](../docs/1.5/1.5.12/MCP-MARKETPLACE-DROX.md).

## Hébergement

- **Prod / CI** : `https://raw.githubusercontent.com/DroxKiwi/Drox---IDE/<branch>/drox-engine/mcp-registry`
- **Dev local** (avant push) : réglage utilisateur `chat.mcp.gallery.serviceUrl` → URI `file:` vers ce dossier (base, sans `/v0.1/servers`) + `chat.mcp.gallery.version` = `v0.1`

## Smoke

1. Customizations → MCP Servers → catalogue non vide
2. Install filesystem → entrée `.mcp.json` workspace
3. Run agent → outils `mcp__*` visibles si `drox.tools.mcp.enabled`
