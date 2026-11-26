# Drox 1.6.10

## <span style="color:#3fb950">Nouveautés</span>

- <span style="color:#3fb950">+</span> Avant chaque tour, le moteur réduit le contexte (carte de situation, extrait chaud, compactage, snip) sans remplacer la boucle Drox.
- <span style="color:#3fb950">+</span> Budget de contexte et estimation de la requête avant l’appel au modèle.
- <span style="color:#3fb950">+</span> Reprise du run après un dépassement de contexte signalé par le provider.
- <span style="color:#3fb950">+</span> Arguments d’outils contrôlés contre le schéma de l’outil.
- <span style="color:#3fb950">+</span> Checkpoint des fichiers du workspace en revert d’abord : un instantané par run, avant les écritures.
- <span style="color:#3fb950">+</span> Bouton pour restaurer les fichiers jusqu’à un message utilisateur. Deux messages du même run reviennent au même instantané.
- <span style="color:#3fb950">+</span> Notices de clôture de run, et première vague de compaction écrite sur la session.
- <span style="color:#3fb950">+</span> Règles projet `.drox/rules/*.instructions.md`, relues au tour suivant. Outil `project_rule_write` (créer, mettre à jour, ajouter).
- <span style="color:#3fb950">+</span> Surface d’outils `core` / `standard` / `full` / `custom`. Le profil est un plafond. La régulation ne peut qu’enlever des outils.
- <span style="color:#3fb950">+</span> Clé à molette dans le chat IDE et dans le cadre d’historique du mode Agent. Un outil décoché est écrit dans `.drox/tools-surface.json` et n’est pas réactivé par un preset.
- <span style="color:#3fb950">+</span> Mentions `@fichier` et `@dossier` à l’envoi. Le texte part au modèle. La bulle affichée reste le texte tapé. Le glisser-déposer des pièces jointes ne change pas.
- <span style="color:#3fb950">+</span> Profils affichés **SLM**, **MLM**, **LLM** (identifiants internes inchangés : `local-9b`, `local-27b`, `cloud-full`).
- <span style="color:#3fb950">+</span> Profil, itérations, Explore, sous-agents, règles projet, lecture et écriture hors workspace, pensée native et langue : dans Model settings.
- <span style="color:#3fb950">+</span> Sous Change connection, section Connexions enregistrées : raccourcis des backends déjà utilisés.
- <span style="color:#3fb950">+</span> Pastille Changes : les fichiers non suivis comptent leurs lignes (un binaire ou un fichier illisible compte pour 1). Même calcul dans l’IDE et le mode Agent.
- <span style="color:#3fb950">+</span> Badge Changes carré sur les deux chats. Le `+` est vert, le `−` est rouge.
- <span style="color:#3fb950">+</span> Compositeur IDE : cadre gris à angles droits, boutons sans contour, comme le mode Agent.
- <span style="color:#3fb950">+</span> Bouton copier sur les blocs de code de l’aperçu Markdown.
- <span style="color:#3fb950">+</span> Indicateur de lignes repliées (`editor.renderWordWrapIndicator`).
- <span style="color:#3fb950">+</span> `git.worktreeSymlinkFolders` : un nouveau worktree peut symlink les dossiers ignorés qui correspondent au réglage.
- <span style="color:#3fb950">+</span> Mermaid 12 pour l’aperçu Markdown et les notebooks.

**Ajouts : 21**

## <span style="color:#f85149">Corrections</span>

- <span style="color:#3fb950">+</span> Notebook Mermaid : un contenu non fiable ne sort plus du mode restreint.
- <span style="color:#3fb950">+</span> Worker d’extension : plus d’exécution cross-origin.
- <span style="color:#3fb950">+</span> Le terminal ne démarre pas dans un workspace non fiable, y compris à la relance.
- <span style="color:#3fb950">+</span> Les schémas de liens du terminal ne contournent plus la confiance du workspace.
- <span style="color:#3fb950">+</span> Un lien OSC 99 du terminal ne lance plus une commande.
- <span style="color:#3fb950">+</span> Une webview ne lit plus hors de `localResourceRoots`.
- <span style="color:#3fb950">+</span> Un objet de configuration imbriqué ne réactive plus un réglage restreint.
- <span style="color:#3fb950">+</span> `__proto__` n’est plus un setter pendant la fusion de configuration.
- <span style="color:#3fb950">+</span> Une valeur mal formée de `security.workspace.trust.enabled` ne désactive plus la confiance.
- <span style="color:#3fb950">+</span> Le dialogue de confiance n’interprète plus le nom d’éditeur comme un lien Markdown.
- <span style="color:#3fb950">+</span> Le texte de galerie d’une extension n’est plus rendu comme du Markdown exécutable.
- <span style="color:#3fb950">+</span> Un nom d’éditeur hérité (`constructor`, etc.) ne passe plus la politique d’extensions autorisées.
- <span style="color:#3fb950">+</span> Le nom d’un serveur MCP ne sort plus du dossier de stockage.
- <span style="color:#3fb950">+</span> Une notification d’élicitation MCP n’est plus un lien cliquable contrôlé par le serveur.
- <span style="color:#3fb950">+</span> Une image Markdown en chemin UNC ne passe plus par `vscode-file` sans allowlist.
- <span style="color:#3fb950">+</span> Plus de fenêtre d’erreur au démarrage pour `telemetry.enableTelemetry` et `telemetry.telemetryLevel`.
- <span style="color:#f85149">−</span> L’écriture forcée de ces deux réglages au lancement. L’envoi 1DS reste coupé. `telemetry.feedback.enabled` reste.
- <span style="color:#f85149">−</span> Les scripts et tâches `watch-copilot`, qui ouvraient `extensions/copilot` absent et arrêtaient `npm run watch`.

**Ajouts : 16** · **Suppressions : 2**

## <span style="color:#6cb6ff">Expérimental</span>

- <span style="color:#3fb950">+</span> `workbench.experimental.modernUI` est activé par défaut : barres et panneau en cartes. Le réglage se coupe.

**Ajouts : 1**

**Total des ajouts : 38** · **Total des suppressions : 2**
