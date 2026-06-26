# Guide — Connexions MCP (spec 1.5.8)

**Statut** : brouillon produit — à promouvoir vers `drox-engine/docs/operations/07-MCP-CONNEXIONS.md` à la livraison.

---

## À quoi servent les connexions MCP ?

Le **Model Context Protocol** (MCP) permet à Drox d’appeler des **outils externes** : GitHub, base de données, navigateur, fichiers distants, etc. — sans coder chaque intégration dans l’IDE.

| Concept | Exemple |
|---------|---------|
| **Serveur MCP** | Processus ou service qui expose des outils |
| **Outil** | `create_issue`, `query`, `screenshot`… |
| **Ressource** | Fichier ou document lisible par le modèle |

Drox transforme les outils MCP en appels `mcp__<serveur>__<outil>` pour le modèle (voir [GUIDE moteur §6.13](../../0.0/guides/GUIDE-MOTEUR-DROX.md)).

---

## Où configurer (cible 1.5.8)

| Emplacement | Rôle |
|-------------|------|
| **Connexions MCP** (section Drox — à créer) | Voir l’état, ajouter / éditer, activer pour le moteur |
| **Fichier workspace** | `.mcp.json` ou `mcp.json` à la racine du projet |
| **Réglage** | `drox.tools.mcp.enabled` — expose ou non les outils au LLM |

Aujourd’hui (avant 1.5.8) : seul le toggle MCP existe dans les réglages généraux du chat ; la gestion des serveurs passe par le fichier JSON ou la vue MCP VS Code (Extensions), peu visible.

---

## Format du fichier

```json
{
  "mcpServers": {
    "mon-serveur": {
      "command": "npx",
      "args": ["-y", "package-du-serveur-mcp"],
      "env": {
        "CLE_API": "valeur"
      }
    }
  }
}
```

Transports supportés par le moteur (objectif 1.5.8) : **`stdio`** (local) ; **SSE/HTTP** si déjà géré par `drox-mcp` / workbench.

---

## Parcours utilisateur (cible)

1. Ouvrir **Drox → Connexions MCP**
2. **Ajouter un serveur** (formulaire ou « Éditer `.mcp.json` »)
3. Vérifier l’état **Connecté** et la liste d’outils
4. Activer **« Exposer au modèle »** (`drox.tools.mcp.enabled`)
5. Lancer un run dans Drox Chat — le modèle peut appeler `mcp__mon-serveur__…`

---

## Exemples de serveurs (communauté)

| Besoin | Package / serveur | Prérequis |
|--------|-------------------|-----------|
| GitHub | `@modelcontextprotocol/server-github` | Token PAT |
| Fichiers | serveurs « filesystem » MCP | Chemins autorisés |
| Postgres | serveurs SQL MCP | URL base |

Liste officielle : [modelcontextprotocol.io](https://modelcontextprotocol.io/).

---

## Dépannage (prévu doc ops)

| Symptôme | Piste |
|----------|--------|
| Aucun outil `mcp__*` | `drox.tools.mcp.enabled` = false ou serveur non démarré |
| Erreur au spawn | `command` / `npx` introuvable dans le PATH WSL vs Windows |
| Outil visible mais échec | Logs serveur MCP · permissions env |

---

## Relation avec VS Code

Le fork embarque `contrib/mcp` (vue **MCP Servers**). La 1.5.8 **adapte** cette brique (rebrand, sans galerie Copilot) plutôt que de la dupliquer. Une seule config `.mcp.json` doit alimenter **workbench** et **moteur Drox**.

---

## Pour les agents IA

- Ne pas confondre MCP workbench (chat Microsoft) et **`drox.tools.mcp.enabled`** (moteur Rust).
- Config : racine workspace, pas `~/Drox---IDE` clone isolé.
- Plan technique : [PLAN-1.5.8.md](PLAN-1.5.8.md).
