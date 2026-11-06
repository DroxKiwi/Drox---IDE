# Codebase

L’onglet **Codebase** (barre d’activité) est le cockpit de l’index local du dossier ouvert. Il ne lance pas un second modèle de discussion. Il prépare des extraits que le run peut recevoir sans relire tout le projet.

Dans Agents, le même cockpit est dans la barre auxiliaire de droite. L’icône base de données sur une ligne d’historique ouvre l’index **de cette discussion**. Seule la discussion active est indexée.

Référence moteur et fichiers : [codebase-and-rag.md](../engine/codebase-and-rag.md).

## S’en servir

1. Ouvre un dossier. Le chemin et l’état s’affichent en haut du cockpit. Sans dossier : « No folder open ».
2. Laisse l’index se faire, ou clique **Reindex**.
3. Dans le chat, le modèle cherche avec l’outil `codebase_search`, ou reçoit un paquet injecté avant `agent.run`.
4. La puce **Codebase** du composer force un inject plus large sur le **prochain** envoi. Un second clic l’annule.

Le modèle ne déclenche pas l’index. Le service IDE le tient à jour. Le modèle ne fait que chercher ou lire le paquet qu’on lui a mis dans le contexte.

## Ce que l’index contient

Les fichiers indexables du dossier de la discussion vont dans `{dossier}/.drox/codebase-index/`. Un hash évite de tout refaire si rien n’a changé. `.git`, `.drox`, `node_modules` et les ignores habituels ne sont pas indexés. Un dossier vide ou entièrement ignoré lève `EMPTY_WORKSPACE` : l’index est sain, il n’y a rien à y mettre.

La recherche mélange le texte et des vecteurs. Les vecteurs viennent d’un modèle d’embedding à part, **all-MiniLM-L6-v2** en GGUF Q4 (environ 20 Mo, 384 dimensions). Ce n’est pas le modèle du chat. On le remplace avec `drox.codebase.embedModelPath`. Le cockpit peut revenir au modèle par défaut. Couper les vecteurs (`drox.codebase.embedEnabled`) laisse la recherche textuelle.

`EMBED_NOT_BUILT` veut dire que le `drox.exe` lancé n’a pas la feature `embed` : la recherche reste lexicale. `EMBED_PARTIAL` ou `EMBED_CHUNK_SKIPPED` veut dire qu’un morceau (binaire, NUL) a été sauté et que le reste a continué.

**Purge all saved data** efface l’index de cette racine après confirmation. L’export de diagnostic copie un JSON et l’écrit sous `.drox/codebase-index/`.

## Lien avec le run

Avant `agent.run`, l’IDE peut injecter des extraits. Le budget de cet inject suit le levier **L1** de Regulation (`minimal` réduit, `rich` élargit). La posture **L5** change l’incitation à appeler `codebase_search` (`passive`, `nudge`, `aggressive`). Voir [regulation.md](regulation.md).

Changer de discussion Agents appelle `setActiveRoot` : l’index, l’inject et les notes de régulation suivent le nouveau dossier.
