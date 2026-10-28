# 1.6.2 — Objectifs

**Statut** : cadrage · pas de lot code tant que non validé  
**Réf. produit** : parité UX **Cursor** — plusieurs discussions ouvertes dans **un même workspace**.

---

## O1 — Onglets de discussion (chat natif IDE) — **clos**

**Statut** : clos. Bandeau dans le panneau natif IDE uniquement (`droxIdeNativeChatTabStrip`). Le `+` du header ouvre un onglet. Persistance propre (`drox.ideNativeChat.tabs`), pas le layout partagé avec Agents. Plafond 10. Dogfood validé.

### Contexte

- Le **chat natif** (`DroxNativeChatViewPane`, `drox.ideNativeChatTab.enabled`) n’affiche qu’**une** session à la fois : **Nouveau chat** remplace la vue ; **Historique** = QuickPick.
- Le **chat webview legacy** a déjà une barre d’onglets (`DroxChatTabsManager`, `session-tabs-list`, `08-tabs.js`).
- `DroxChatLayoutStore` persiste déjà `tabs[]` + `activeTabId`, mais le natif ne fait qu’**enregistrer** la session courante sans UI de bascule.

### Objectif

Dans le panneau **Drox** de l’IDE (même dossier workspace) :

| Comportement | Détail |
|--------------|--------|
| Plusieurs fils ouverts | Chaque onglet = un `ses_*` moteur distinct |
| Bascule | Clic onglet → charger ce transcript (sans fermer les autres) |
| Nouveau | `+` → **nouvel onglet** (ne pas seulement remplacer l’actif) |
| Fermeture | `×` sur onglet ; si actif → activer le voisin ou en créer un |
| Persistance | Restaurer onglets + actif au redémarrage (`DroxChatLayoutStore`) |
| Run en cours | Garder la règle actuelle : pas de switch / nouveau fil tant qu’un run tourne (message utilisateur) |

### Périmètre v1 (à figer avant dev)

| Sujet | Proposition par défaut |
|-------|----------------------|
| Surface | **IDE natif** uniquement (pas la fenêtre Agents en v1) |
| Draft composer | **v2** : mémoriser le texte non envoyé par `ses_*` au switch (v1 = comportement actuel, un seul `ChatWidget`) |
| Limite onglets | À trancher (ex. 10) |
| Titres | Réutiliser `deriveSessionTabTitle` / enrichissement liste sessions |

### Pistes techniques (réutilisation)

- UI : bandeau au-dessus du `ChatWidget` dans `droxNativeChatViewPane.ts` + CSS dédié (s’inspirer de `droxChatMvp.css` / `08-tabs.js`).
- Logique : extraire le minimum de `DroxChatTabsManager` (`openNewChatTab`, `switchChatTab`, `closeChatTab`, restore layout) adapté au natif (`_openDroxSession` déjà sérialisé).
- **Pas** de double run moteur simultané sur le même workspace (aligné webview).

### Critères d’acceptation (smoke)

1. Ouvrir 3 onglets, envoyer un message dans chacun, revenir sur le 1er → historique intact.
2. Fermer l’onglet actif → focus correct.
3. Redémarrer l’IDE → mêmes onglets + actif restaurés (workspace identique).
4. Run actif → switch / nouveau / fermer actif refusés avec message clair.

### Docs / suivi

- Réf. engine : [ide-integration](../../engine/ide-integration.md), sessions [sessions-and-memory](../../engine/sessions-and-memory.md).
- Après livraison : note release + éventuel paragraphe dans [engine/README](../../engine/README.md) si contrat UX visible.

---

## O2 — Sync modèle après changement de provider / connexion

### Symptôme

Après passage **cloud → self-hosted** (ou l’inverse) : la connexion teste OK, le **picker** affiche un modèle « par défaut » du nouveau catalogue (ex. `qwen3.8`), mais le **run** appelle encore l’ancien `drox.architect.model` (ex. `glm-5.3-flash` sur le nouveau endpoint) → 403 / modèle introuvable.

Repro utilisateur : il faut **rouvrir la liste** et **re-cliquer** le modèle déjà affiché pour que la config soit persistée.

### Cause (comportement actuel)

- `agent.run` lit **`drox.architect.model`** via `buildAgentRunParams` / `readLlmSettings` — pas le libellé du picker seul.
- Le chat natif VS Code peut **réinitialiser le picker** (`setCurrentLanguageModelToDefault`) quand l’ancien modèle n’est plus dans la liste, **sans** `isUserAction` → `syncDroxArchitectModelFromChatPicker` ne s’exécutait pas.
- `DroxLlmModelsService.refresh()` recharge la liste mais **ne réconcilie** pas la config si le modèle persisté ∉ nouveaux modèles.

### Objectif

À chaque changement de catalogue (provider / server / liste modèles) : si `drox.architect.model` ∉ `models[]` et `models.length > 0`, **persister** un modèle valide (ex. premier de la liste ou défaut picker) **sans** clic manuel.

### Critères d’acceptation

1. Changer de provider + envoyer un message → le `model` RPC = modèle affiché dans la barre Drox.
2. Pas de régression : choix explicite utilisateur dans le picker reste la source de vérité.
3. Test unitaire ou smoke sur `reconcile` après `refresh()`.

### Docs

- [DIAG connexion / modèles](DIAG-PROVIDER-MODEL-SYNC.md) (fiche courte post-fix).

---

## O3 — Doc incident Ollama tokenize

- [DIAG-OLLAMA-TOKENIZE-500.md](DIAG-OLLAMA-TOKENIZE-500.md)

---

## O4 — Fin de run : conclusions répétées — **clos**

**Statut** : clos. Profil **local** (`local-9b` / `local-27b`) : une seule conclusion visible. Dogfood local capable validé. Le moteur ne réémet plus un bilan déjà streamé, et le prompt local n’exige plus de le réécrire après `[phase: answering]`.

### Symptôme (historique)

Sur profil **Full protocol — 1.6.0** (`cloud-full`), avec **GLM-5.3-flash** (Ollama Cloud observé) : en clôture, le modèle affiche **5–6 fois** le même récapitulatif utilisateur. Entre les blocs, le chat natif peut montrer **« Finished with 1 step »** (tours thinking / raisonnement), signe de **plusieurs tours LLM** de fin de run, pas d’un simple bug d’affichage markdown.

Même famille de problème que les **doubles conclusions** en **`local-27b`** (`LOCAL_SOFT_CLOSE_CHECK`), mais mécanisme distinct : ici le protocole **`[phase: answering]` + `[phase: done]`** et les gates associées.

### Contexte technique (rappel)

- Fin propre = **`[phase: done]`** après **`answering`** (`drive.rs`, Sprint A.2 / A.3).
- GLM omet souvent le marqueur `done` → nudge **`DONE_ONLY`** ; le modèle peut malgré tout **réécrire** tout le bilan (commentaire moteur : cas **GLM-4.7-Flash**).
- Gates **todo ouverte** ou **testing** après mutation peuvent **relancer** l’LLM sans reset agressif du LoopDetector → plusieurs bilans si le texte varie légèrement.

### Objectif

**Stabiliser la clôture** : un seul message utilisateur visible (ou une escalade moteur explicite), sans rafale de 5–6 récaps identiques.

### Critères d’acceptation

1. Scénario dogfood repro (edit + bilan) : **≤ 1** bloc `answering` visible en clôture, ou message moteur unique type « run terminé » si le modèle refuse `done`.
2. Test moteur : scripted « answering long sans done » (variantes GLM) → Stop en **≤ 3** tours de clôture sans répéter le même contenu streamé.
3. Pas de régression : gates todo / testing restent actives quand le modèle tente un `done` prématuré (cf. `loop_does_not_abort_when_done_blocked_by_open_todo_repeated`).

### Pistes (ordre indicatif)

| Piste | Type |
|-------|------|
| Compteur / clôture moteur après `DONE_ONLY` non respecté | Moteur |
| `bash` post-mutation compte pour gate testing si pertinent | Moteur |
| Rappel prompt famille GLM (`done` seul) | Prompts |
| Regroupement blocs thinking en rafale | IDE (secondaire) |

### Docs

- [DIAG-CLOSURE-REPEAT.md](DIAG-CLOSURE-REPEAT.md)

---

## O5 — Revue des prompts système (`drox-prompts`)

### Contexte

Les prompts runtime (CORE, gates, nudges, variantes local vs `cloud-full`) vivent dans **`drox-prompts`** + façade `drox-cli/src/prompts/mod.rs`. La doc 1.6.1 décrit le protocole actuel ; le contenu des prompts n’a pas été **repassé** pour 1.6.2 (clôture, profils, outils, ton).

### Objectif

**Relire et ajuster** les prompts système injectés au modèle (parent et sous-runs concernés), en restant aligné avec les gates Rust (`drive.rs`, `gates/`) — pas de règles « prompt only » que le moteur ne tient pas.

### Critères d’acceptation (à figer avant patch)

1. Inventaire des constantes réellement injectées (CORE, nudges, local, professor si encore câblé).
2. Décisions écrites : ce qui change / ce qui reste, par `EngineProfile`.
3. Après patch : dogfood court local + `cloud-full` sans régression de clôture (lien O4 si le rappel GLM/`done` est dans ce lot).

### Docs / code

- [system-prompts-and-phases](../../engine/system-prompts-and-phases.md) · pédagogie [07](../../pedagogie/07-phases-et-gates.md).
- Crate : `drox-engine/drox/crates/drox-prompts/`.

---

## O6 — Retirer les `Co-authored-by` Cursor

**Statut** : reporté. Pas de réécriture d’historique dans le lot en cours.

### Règle

Aucune mention de Cursor en contributeur ou en co-commit (`Co-authored-by: Cursor <cursoragent@cursor.com>`).

### Constat (2026-10-28)

| Portée | Commits |
|--------|---------|
| `origin/main` | **1** — `9ceb4007` (2026-10-28, doc 1.6.1). C’est lui qui affiche **cursoragent** dans les contributeurs GitHub. |
| Tag `v1.5.20` (hors historique de `main`) | **19** — du 2026-05-28 au 2026-09-28 (lignes 1.4.1, 1.5.19, 1.5.20). |
| Commit local clôture 1.6.2 (`c7ac2131`) | Pas de trailer. |

### Objectif

Nettoyer ces messages de commit pour que **cursoragent** disparaisse des contributeurs. Réécriture d’historique (et force-push de `main`, plus déplacement du tag `v1.5.20` si les reliquats doivent disparaître aussi). À trancher au moment du lot.

---

## O7 — Plusieurs connexions backend, bascule sans ressaisie

### Contexte

Aujourd’hui une seule connexion d’inférence est mémorisée. **Changer de connexion** rouvre l’assistant sur la **dernière** étape. Pour passer d’un backend à un autre, l’utilisateur ressaisit URL, modèle d’hébergement et identifiants.

### Objectif

Enregistrer **plusieurs** connexions déjà établies (URL, type d’hébergement, en-têtes / identifiants). **Changer de connexion** ouvre l’assistant sur la **première** étape, avec la liste de ces connexions. Un clic en active une, sans ressaisie.

### Critères d’acceptation

1. Deux backends enregistrés → bascule de l’un à l’autre sans retaper les identifiants.
2. **Changer de connexion** démarre à l’étape 1, pas à l’étape finale.
3. La liste affiche les connexions déjà établies ; la connexion active reste identifiable.
4. Une nouvelle connexion (saisie + test) s’ajoute à la liste.

---

## O8 — Style graphique du mode Agents

### Contexte

Le mode **Agents** (fenêtre / panneau Agents : liste de sessions, composer, panneaux latéraux) n’est pas homogène. Les surfaces ne partagent pas les mêmes traitements (chrome, barres, composer, listes).

### Objectif

Revoir l’implémentation du style pour un rendu cohérent sur tout le mode Agents, aligné sur la charte. Pas un nouveau thème : unifier ce qui existe.

### Critères d’acceptation

1. Liste de sessions, composer et panneaux du mode Agents partagent les mêmes couleurs, rayons, bordures et typo.
2. Pas de régression du chat natif IDE (hors de ce lot, sauf token partagé évident).

---

## Hors scope 1.6.2 (sauf décision explicite)

- Onglets dans la **fenêtre Agents** (liste sessions à gauche = autre métaphore).
- Runs parallèles sur deux sessions dans un même workspace.
