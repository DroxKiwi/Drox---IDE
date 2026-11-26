# Drox IDE 1.6.10

## Nouveautés

- Avant chaque tour, le moteur réduit le contexte (carte de situation, extrait chaud, compactage, snip) sans remplacer la boucle Drox.
- Budget de contexte et estimation de la requête avant l'appel au modèle.
- Reprise du run après un dépassement de contexte signalé par le provider.
- Arguments d'outils contrôlés contre le schéma de l'outil.
- Checkpoint des fichiers du workspace en revert d'abord : un instantané par run, avant les écritures.
- Bouton pour restaurer les fichiers jusqu'à un message utilisateur. Deux messages du même run reviennent au même instantané.
- Notices de clôture de run, et première vague de compaction écrite sur la session.
- Règles projet `.drox/rules/*.instructions.md`, relues au tour suivant. Outil `project_rule_write` (créer, mettre à jour, ajouter).
- Surface d'outils `core` / `standard` / `full` / `custom`. Le profil est un plafond. La régulation ne peut qu'enlever des outils.
- Clé à molette dans le chat IDE et dans le cadre d'historique du mode Agent. Un outil décoché est écrit dans `.drox/tools-surface.json` et n'est pas réactivé par un preset.
- Mentions `@fichier` et `@dossier` à l'envoi. Le texte part au modèle. La bulle affichée reste le texte tapé. Le glisser-déposer des pièces jointes ne change pas.
- Profils affichés SLM, MLM, LLM (identifiants internes inchangés : `local-9b`, `local-27b`, `cloud-full`).
- Profil, itérations, Explore, sous-agents, règles projet, lecture et écriture hors workspace, pensée native et langue : dans Model settings.
- Sous Change connection, section Connexions enregistrées : raccourcis des backends déjà utilisés.
- Pastille Changes : les fichiers non suivis comptent leurs lignes (un binaire ou un fichier illisible compte pour 1). Même calcul dans l'IDE et le mode Agent.
- Badge Changes carré sur les deux chats. Le `+` est vert, le `−` est rouge.
- Compositeur IDE : cadre gris à angles droits, boutons sans contour, comme le mode Agent.
- Bouton copier sur les blocs de code de l'aperçu Markdown.
- Indicateur de lignes repliées (`editor.renderWordWrapIndicator`).
- `git.worktreeSymlinkFolders` : un nouveau worktree peut symlink les dossiers ignorés qui correspondent au réglage.
- Mermaid 12 pour l'aperçu Markdown et les notebooks.

## Corrections

- Notebook Mermaid : un contenu non fiable ne sort plus du mode restreint.
- Worker d'extension : plus d'exécution cross-origin.
- Le terminal ne démarre pas dans un workspace non fiable, y compris à la relance.
- Les schémas de liens du terminal ne contournent plus la confiance du workspace.
- Un lien OSC 99 du terminal ne lance plus une commande.
- Une webview ne lit plus hors de `localResourceRoots`.
- Un objet de configuration imbriqué ne réactive plus un réglage restreint.
- `__proto__` n'est plus un setter pendant la fusion de configuration.
- Une valeur mal formée de `security.workspace.trust.enabled` ne désactive plus la confiance.
- Le dialogue de confiance n'interprète plus le nom d'éditeur comme un lien Markdown.
- Le texte de galerie d'une extension n'est plus rendu comme du Markdown exécutable.
- Un nom d'éditeur hérité (`constructor`, etc.) ne passe plus la politique d'extensions autorisées.
- Le nom d'un serveur MCP ne sort plus du dossier de stockage.
- Une notification d'élicitation MCP n'est plus un lien cliquable contrôlé par le serveur.
- Une image Markdown en chemin UNC ne passe plus par `vscode-file` sans allowlist.
- Plus de fenêtre d'erreur au démarrage pour `telemetry.enableTelemetry` et `telemetry.telemetryLevel`.
- L'écriture forcée de ces deux réglages au lancement. L'envoi 1DS reste coupé. `telemetry.feedback.enabled` reste.
- Les scripts et tâches `watch-copilot`, qui ouvraient `extensions/copilot` absent et arrêtaient `npm run watch`.

## Expérimental

- `workbench.experimental.modernUI` est activé par défaut : barres et panneau en cartes. Le réglage se coupe.

## Licence

Basé sur Code OSS (MIT). Voir [NOTICE.md](../../NOTICE.md).
