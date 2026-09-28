# Smoke `ses_7d5db0f1` — Retour de test dogfood Qwen 27B

**Version** : juin 2026 — branche `1.4.1` · chantier **1.4.1.3**  
**Statut** : **analysé, non patché** — document de retour pour clôture 1.4.1.3  
**Transcript court** : [`chat_qwen27b.txt`](../../chat_qwen27b.txt) (PARTIE A tronquée, 2621 lignes)  
**Export complet** : `site-kdds\.drox\exports\transcript-ses_7d5db0f1-12b7-4c40-ab9d-3c05314eef20-2026-06-14T16-34-44-696Z.txt` (PARTIE A + B + C)

> Brief identique aux smokes précédents : remplacer le système SVG de transition entre parties 1 et 2 de la page d'accueil par des animations Framer Motion sophistiquées (`site-kdds`).  
> Run **Qwen 3.6 27B** sur binaire **`1.4.0.340742`** — **sans** gate `internal_plan_write` (build antérieur à Phase A 1.4.1.3).  
> À comparer : [`ses_2e0b2a5e`](SMOKE-ses_2e0b2a5e.md) (échec spirale file_write) · [`ses_4b2c1d08`](SMOKE-ses_4b2c1d08.md) (partiel vert post-1.4.1.2).

---

## Contexte du run

| Champ | Valeur |
|-------|--------|
| **Session** | `ses_7d5db0f1-12b7-4c40-ab9d-3c05314eef20` |
| **Workspace** | `c:\Users\coren\Desktop\GitHub\site-kdds` |
| **Rôle** | `architect` (Edit) |
| **Build moteur** | `1.4.0.340742` (stamp Rust `#340742`) |
| **Tokens** | **50 924 in** / **677 out** / **38 130 ctx** |
| **Journal UI** | 27 007 événements · 430 steps structurés (PARTIE A) |
| **Transcript moteur** | 77 messages · **18** tool results indexés (PARTIE B) |
| **Fin de run** | `phase: done` · `busy: false` · réponse utilisateur livrée |

### Brief utilisateur

> Supprimer le système SVG de transition entre la partie 1 et 2 de la page d'accueil, le remplacer par des animations Framer Motion Next.js sophistiquées.

### Verdict synthétique

| Critère | Résultat |
|---------|----------|
| Tâche livrée (mutation réelle) | ✅ `section-transition.tsx` rewrite + `globals.css` |
| Vérification (`tsc --noEmit`) | ✅ |
| Clôture run (`[phase: done]`) | ✅ |
| Parcours efficace | ❌ ~52 % du run en boucle fantôme avant le 1er vrai outil |
| `internal_plan_write` | ⏭️ non testé (build obsolète) |
| Lisibilité export pour analyse | ⚠️ PARTIE A seule insuffisante |

**Lecture globale** : le run **réussit** sur le fond, mais expose une **friction protocolaire majeure** — le modèle simule des appels outils en texte, le moteur relance sans résultats, le thinking panique (« je ne peux pas lire ») alors que les outils fonctionnent dès que le modèle émet des `tool_calls` natifs.

---

## Méthode d'analyse

Pour chaque problème ci-dessous, la détection repose sur **croisement de trois sources** :

| Source | Ce qu'elle montre | Limite |
|--------|-------------------|--------|
| **PARTIE A** (journal UI) | Thinking streams, deltas `ASSISTANT STREAM`, jauge `tokensUsed`, steps `TOOL` tardifs | N'affiche pas les résultats d'outils avant step ~277 ; peut laisser croire à un échec total |
| **PARTIE B** (transcript moteur) | Messages persistés, `Tool call` / `Tool result`, index chronologique | Source de vérité pour exécution réelle |
| **PARTIE C** (JSONL brut) | `kind: tool` start/finish, `argsPreview`, `isError` | Verbose ; utile pour confirmer args vides vs structurés |

### Indices de repérage utilisés

1. **Boucle fantôme** — PARTIE B : messages assistant 2–39 = texte `[tool_use]…</tool_use>` sans bloc `tool_use` structuré ni message `role: tool` associé.
2. **Nudge moteur** — thinking qui cite *« Continue as Architect… re-read your last tool results »* → correspond à `schema_error_continue_nudge` (`agent/nudges/schema_error.rs`, `CONTINUE_PROMPT`).
3. **Vraie exécution** — premier `Tool call: workspace_map_read (tu_019ec6f6-…)` au **message 41** ; `Tool results indexed: 18` en tête PARTIE B.
4. **Hallucination** — thinking qui cite `WaveDivider`, `src/app/page.tsx` 1065 lignes **avant** message 41, alors que le vrai fichier est `app-kdds-main/src/components/section-transition.tsx`.
5. **Succès final** — steps 413–421 PARTIE A : todos complétés, `ANSWER STREAM`, `phase: done`.

---

## Backlog problèmes (liste complète)

| # | ID | Problème | Gravité | Cause hypothétique (résumé) | Plan cible |
|---|-----|----------|---------|----------------------------|------------|
| 1 | **B-PROTO-01** | Boucle ~39 tours : `[tool_use]` émis en **texte** au lieu de `tool_calls` API | **P0** | Incompatibilité protocole Qwen 27B + absence de gate dédiée | 1.4.1.3 |
| 2 | **B-NUDGE-01** | Nudge `SchemaErrorContinue` demande de relire des tool results **inexistants** | **P0** | Nudge générique quand tour sans outil ni `done` | 1.4.1.3 |
| 3 | **B-MODEL-01** | Thinking « je ne peux pas lire / accéder au workspace » | **P1** | Effet secondaire de B-PROTO-01 + B-NUDGE-01 | 1.4.1.3 |
| 4 | **B-MODEL-02** | Hallucination chemins/composants pendant la boucle | **P1** | Inférence Next.js générique sans tool_result | 1.4.1.3 |
| 5 | **B-PHASE-01** | `[phase: answering]` + code utilisateur fuit dans le **thinking** | **P1** | Marqueur phase traité comme texte stream, pas gate | 1.4.1.2+ |
| 6 | **B-CTX-01** | ~51k tokens in dont ~40 tours stériles | **P1** | Conséquence directe B-PROTO-01 | 1.4.1.3 |
| 7 | **B-EXPORT-01** | Export PARTIE A tronqué masque l'exécution réelle | **P2** | `chat_qwen27b.txt` = copie partielle sans PARTIE B | 1.4.1.3 doc |
| 8 | **B-PATH-01** | Hypothèse répétée `src/app/page.tsx` vs `app-kdds-main/…` | **P2** | Pas de `workspace_map_read` avant msg 41 | 1.4.1.3 |
| 9 | **B-BASH-01** | `bash` avec `head` bloqué sur Windows | **P3** | Gate cmd.exe documentée, contourné au tour suivant | existant |
| 10 | **B-SCOPE-01** | `internal_plan_write` absent — gate L2 non exercé | **info** | Build `340742` antérieur à Phase A | re-smoke post-build |
| 11 | **—** | Réponses prématurées (~5108 c) avant exploration | **P1** | Modèle tente `answering` sans `done` → relance moteur | 1.4.1.3 |

---

## Détail par problème

### 1 — Boucle pseudo-`[tool_use]` en texte (B-PROTO-01)

**Symptôme observé**

- Dans le journal UI (steps 8–276), le canal `ASSISTANT STREAM` affiche uniquement des lignes du type :
  ```text
  [tool_use]file_read</tool_use>
  [tool_use]file_read{path: "src/app/page.tsx"}</tool_use>
  ```
- Aucun step `TOOL` structuré avant le step **277** (`Tool call: workspace_map_read`).
- Le modèle enchaîne des tours de thinking de plus en plus anxieux (« empty results », « simulation »).

**Comment on le repère**

| Méthode | Preuve |
|---------|--------|
| PARTIE B — index messages | Messages **2 à 39** : rôle `assistant`, contenu texte 30–56 caractères, motif `[tool_use]…` |
| PARTIE B — message 40 | Texte long (~5108 c) = réponse prématurée sans outil structuré |
| PARTIE B — message 41 | **Premier** `### Tool call: workspace_map_read (tu_019ec6f6-…)` avec JSON d'arguments `{}` |
| PARTIE C | Événements `#7918` etc. : `{"kind":"delta","text":"[tool_use]file_edit</tool_use>"}` — delta texte, pas `kind: tool` |

**Cause imaginée**

Le modèle Qwen 3.6 27B **mélange deux protocoles** :

1. Des marqueurs texte `[tool_use]nom</tool_use>` (style transcript / Cursor) ;
2. Les `tool_calls` structurés attendus par le provider Ollama/OpenAI-compatible.

Le moteur Drox ne parse **pas** les marqueurs texte comme des invocations. Le tour assistant se termine sans `tool_calls` et sans `[phase: done]` → branche `outcome.rs` :

```text
tour sans tool_call et sans [phase: done] — schema_error continue
```

**Impact** : ~39 tours LLM (~52 % des 76 messages assistant/outil) sans aucune mutation ni lecture réelle.

**Pistes correctives**

- Nudge dédié si regex `[tool_use]` détectée dans le texte assistant sans `tool_calls` associés.
- Renforcement protocole boot / `tool_protocols` : « n'écris jamais `[tool_use]` dans le texte ».
- Adapter le template tool-calling côté provider Qwen si le modèle n'expose pas correctement le canal tools.

---

### 2 — Nudge `Continue as Architect` trompeur (B-NUDGE-01)

**Symptôme observé**

Le thinking cite à répétition :

> *Continue as Architect… re-read your last tool results.*

…alors qu'aucun `tool_result` n'existe dans l'historique depuis le dernier tour.

**Comment on le repère**

| Méthode | Preuve |
|---------|--------|
| Grep thinking (PARTIE A) | ≥ 15 occurrences de « Continue as Architect » / « re-read … tool results » |
| Code moteur | `schema_error.rs` → `CONTINUE_PROMPT` injecté via `NudgeId::SchemaErrorContinue` dans `outcome.rs` |
| PARTIE B | Messages 2–39 : aucun message `role: tool` entre les pseudo-appels |

**Cause imaginée**

Le nudge est conçu pour les tours « idle » légitimes (modèle a oublié de clôturer ou de continuer après un **vrai** outil). Ici il s'applique à un cas différent : **tour texte-only simulant des outils**. La phrase « re-read your last tool results » envoie le modèle chercher du contenu absent → interprétation « outils silencieux / environnement vide ».

**Pistes correctives**

- Variante de nudge quand `messages` ne contient aucun `tool_result` depuis le message user :
  - *« Tu as écrit des marqueurs [tool_use] dans le texte — ils ne s'exécutent pas. Utilise les tool_calls natifs. »*
- Compteur de relances : après N tours identiques, message plus direct ou arrêt run.

---

### 3 — Impression modèle « pas d'accès aux fichiers » (B-MODEL-01)

**Symptôme observé**

Extraits thinking (PARTIE A, steps ~114–181) :

- *« The tool calls seem to be failing or returning empty results »*
- *« I am in a blind mode where I don't actually have access to the user's file system »*
- *« this is a simulation where I am expected to use the tools »*
- *« Since I cannot see the file content, I will create a generic solution »*

**Comment on le repère**

| Méthode | Preuve |
|---------|--------|
| Grep `cannot see` / `empty results` / `simulation` | ≥ 20 passages dans `chat_qwen27b.txt` |
| Contraste temporel | Ces passages **avant** step 277 / message 41 |
| Après message 41 | Thinking factuel : *« OK, the project is under app-kdds-main/ »*, lecture `home-content.tsx`, `SectionTransition` |

**Cause imaginée**

**Pas un problème d'accès workspace** — fausse alarme cognitive :

1. Le modèle voit dans son historique ses propres lignes `[tool_use]…` (persistées comme texte assistant).
2. Il ne voit pas de `tool_result` en retour (normal : rien n'a été exécuté).
3. Le nudge B-NUDGE-01 renforce l'idée qu'il **devrait** y avoir des résultats.
4. Le modèle infère une défaillance système plutôt qu'une erreur de protocole de sa part.

**Ce qui prouve que l'accès fonctionne** (post msg 41)

| Outil | Résultat |
|-------|----------|
| `workspace_map_read` | 105 nœuds, arbre `app-kdds-main/` complet |
| `file_read` | `home-content.tsx` 9482 bytes, `section-transition.tsx` 10906 bytes |
| `file_write` | Rewrite 9111 bytes, `applied: true` + diff |
| `file_edit` | `globals.css` mis à jour (2 edits) |
| `bash` | `tsc --noEmit` exit 0 |

Jauge contexte : `tokensUsed` 6878 → **9674** (+2796) après `workspace_map_read` ; **12228** après premier `file_read` — preuve d'injection contenu.

---

### 4 — Hallucination structure projet (B-MODEL-02)

**Symptôme observé**

Pendant la boucle (avant msg 41), le thinking cite :

- `src/app/page.tsx` (1065 lignes), imports `HeroSection`, `WaveDivider`, `wave-divider.tsx`, `TransitionWave`…
- Chemins sans préfixe `app-kdds-main/`.

**Comment on le repère**

| Méthode | Preuve |
|---------|--------|
| Thinking step ~44 (PARTIE A) | Liste d'imports détaillée mais **aucun** `file_read` structuré avant |
| PARTIE B msg 41+ | Vrais fichiers : `home-content.tsx` importe `SectionTransition` depuis `@/components/section-transition` |
| `workspace_map_read` | Racine Next.js = `app-kdds-main/src/app/page.tsx`, pas `src/app/page.tsx` à la racine workspace |

**Cause imaginée**

Pattern-matching Next.js App Router standard (`src/app/page.tsx`, composants `sections/home/`) sans ancrage factuel. Le modèle **comble le vide** laissé par l'absence de tool_results avec une structure plausible mais fausse pour ce monorepo imbriqué.

**Impact** : réponses prématurées (msg 40, thinking step ~654) avec code générique et typos JSX ; perte de temps jusqu'à la vraie exploration.

---

### 5 — Fuite `[phase: answering]` dans le thinking (B-PHASE-01)

**Symptôme observé**

- Step ~50–57 (PARTIE A) : bloc thinking se termine par `[phase: answering]` suivi d'un long article Markdown + code TSX **dans le flux `internal_reasoning`**.
- Code généré contient des corruptions (`framerfr-motion`, `classNametext`, `useRef);(null`, etc.).
- Le run **continue** après — ce n'est pas la réponse canonique finale.

**Comment on le repère**

| Méthode | Preuve |
|---------|--------|
| Grep `[phase: answering]` | Step ~654 dans thinking ; step 419–420 = vraie phase answering (canal dédié) |
| PARTIE B | Message 40 = texte answering prématuré ; message 77 = réponse finale distincte |
| Gate moteur | `PHASE_MARKER_MUST_BE_TEXT_NOT_TOOL` existe pour pseudo-outil `phase`, pas pour fuite thinking→content |

**Cause imaginée**

Le modèle traite `[phase: answering]` comme une **annotation inline** dans le canal thinking au lieu d'une transition de phase sur le canal content. Le moteur ferme le thinking (`PhaseClose`) puis stream le reste — mais le modèle a déjà mélangé protocole et livrable dans le mauvais canal.

**Impact** : bruit UI, tokens gaspillés, risque que l'utilisateur voie du code incorrect dans le panneau thinking.

---

### 6 — Coût tokens : ~51k in pour une tâche locale (B-CTX-01)

**Symptôme observé**

| Phase | Tokens ctx (approx.) | Activité |
|-------|---------------------|----------|
| Boucle msg 2–40 | ~692 → ~3700 | Thinking + pseudo-outils + answering fantômes |
| Exécution msg 41–77 | ~6878 → **38 130** | 18 outils réels, mutations, vérif |

**Comment on le repère**

- En-tête export : `50 924 in / 677 out / 38 130 ctx`.
- Steps `CONTEXT USAGE` : progression par paliers après chaque vrai tool result.
- Ratio : **677 out** total — très faible vs input → beaucoup de tours « écoute » moteur / re-prompt.

**Cause imaginée**

Conséquence directe de B-PROTO-01 : chaque tour stérile réinjecte snapshot architecte + historique texte des faux `[tool_use]` + nudge. Le travail utile (~18 outils) pourrait tenir en **< 10 tours** (comparer `ses_4b2c1d08` : −70 % tokens).

---

### 7 — Export PARTIE A insuffisant pour diagnostic (B-EXPORT-01)

**Symptôme observé**

- `chat_qwen27b.txt` s'arrête avec : *« clipboard preview truncated — full export: …696Z.txt »*.
- Lecteur du transcript court voit 200+ steps thinking « échec outil » **sans** voir les steps `TOOL` ni la réponse finale structurée (steps 277–421 absents de la copie).

**Comment on le repère**

| Méthode | Preuve |
|---------|--------|
| Ligne 2621 `chat_qwen27b.txt` | Mention troncature + chemin export complet |
| Ligne 5261 export complet | `— fin journal UI structuré (430 steps) —` puis `PARTIE B` |
| Analyse initiale | Risque de conclure « outils cassés » en ne lisant que PARTIE A |

**Cause imaginée**

Copie de travail / preview clipboard limitée à la PARTIE A du journal UI. La PARTIE B (transcript moteur avec tool results) n'est présente que dans l'export `.drox/exports/`.

**Pistes**

- Dogfood checklist : toujours archiver l'export **complet** trois parties.
- Option export : résumé « N tool calls / N errors » en fin de PARTIE A.

---

### 8 — Mauvais chemins par défaut (B-PATH-01)

**Symptôme observé**

- Pseudo-appels ciblent `src/app/page.tsx`, `src/page/app.tsx` (typo), `package.json` à la racine.
- Workspace réel : application sous `app-kdds-main/`.

**Comment on le repère**

| Méthode | Preuve |
|---------|--------|
| PARTIE B msg 2–39 | Arguments texte `path: "src/app/page.tsx"` |
| `workspace_map_read` (msg 41) | Premier enfant pertinent : `app-kdds-main/src/app/page.tsx` |
| Thinking post-41 | Correction immédiate des chemins |

**Cause imaginée**

Heuristique Next.js par défaut avant carte workspace. Lié à B-PROTO-01 : sans `workspace_map_read` exécuté tôt, le modèle devine.

**Note** : une fois le protocole corrigé, `workspace_map_read` en premier outil structuré résout le problème (observé msg 41).

---

### 9 — Gate bash Windows `head` (B-BASH-01)

**Symptôme observé**

```
Blocked: `head` is not available in Windows cmd.exe.
Use `powershell -Command "Get-Content path -TotalCount N"`, `file_read` with line ranges...
```

Commande : `find app-kdds-main/src … | head -10`

**Comment on le repère**

- PARTIE B step 43–46 : `Tool result · ERROR · bash`.
- PARTIE B step 47 : contournement `dir /s /b app-kdds-main\src\*transition*` → succès.

**Cause imaginée**

Gate bash **volontaire** (Windows cmd.exe). Le modèle a utilisé un idiome Unix ; récupération en 1 tour sans bloquer le run.

**Gravité** : P3 — friction connue, pas régression.

---

### 10 — Gate `internal_plan_write` non testée (B-SCOPE-01)

**Symptôme**

Aucun appel `internal_plan_write` dans les 18 tool results. Build `1.4.0.340742` antérieur à la Phase A 1.4.1.3.

**Comment on le repère**

- Grep export complet : `internal_plan_write` absent.
- En-tête PARTIE B : *« Includes … internal_plan_write »* — capacité export, pas preuve d'usage.
- Product version steps 2 et 430 : `1.4.0.340742`.

**Cause**

Ce smoke valide le **parcours legacy** (todo_write L1 seulement). Il **ne valide pas** le fil d'Ariane L2 ni les nudges stale / pre_answering / act_focus.

**Action** : re-smoke obligatoire sur binaire post-Phase A/B/C avant clôture 1.4.1.3.

---

### 11 — Réponses prématurées avant exploration (sans numéro backlog)

**Symptôme**

- Message 40 PARTIE B : ~5108 caractères de solution Framer Motion générique.
- Thinking step ~654 : second bloc answering avec code corrompu.
- Message 77 : **vraie** réponse finale (2326 c) après mutations réelles.

**Comment on le repère**

- PARTIE B index : msg 40 entre pseudo-boucle et vrais outils.
- `outcome.rs` : pas de `[phase: done]` → nudge continue au lieu d'arrêt.

**Cause imaginée**

Modèle tente de « satisfaire » le brief par inférence avant d'avoir lu le repo ; le moteur le renvoie en exploration via B-NUDGE-01 jusqu'à ce qu'il émette enfin de vrais `tool_calls`.

---

## Parcours réussi (phase finale, référence)

Pour éviter le biais « tout est cassé », séquence **messages 41–77** :

```text
workspace_map_read
  → file_read home-content.tsx
  → bash (head) ERROR → bash (dir) OK
  → file_read section-transition.tsx
  → grep globals.css
  → file_read globals.css (lignes 665–710)
  → todo_write (t1–t3)
  → file_write section-transition.tsx (rewrite complet)
  → todo_write
  → file_read + file_edit globals.css (×2)
  → bash tsc --noEmit OK
  → todo_write (tous completed)
  → answering + done
```

**Todos finaux**

| ID | Libellé | Statut |
|----|---------|--------|
| t1 | Rewrite `section-transition.tsx` (Framer Motion, zéro SVG) | completed |
| t2 | Update `globals.css` | completed |
| t3 | Verify build (`tsc`) | completed |

---

## Matrice cause → détection → action

| ID | Signal observable | Outil d'analyse | Action proposée |
|----|-------------------|-----------------|-----------------|
| B-PROTO-01 | Texte `[tool_use]` sans step `TOOL` | PARTIE B msg 2–39 | Nudge + doc protocole + test provider Qwen |
| B-NUDGE-01 | Thinking cite « re-read tool results » sans tool msg | Grep + `schema_error.rs` | Nudge conditionnel si pas de tool_result |
| B-MODEL-01 | « cannot see » / « simulation » | Grep thinking PARTIE A | Devrait diminuer si B-PROTO/B-NUDGE corrigés |
| B-MODEL-02 | Noms fichiers absents du workspace_map | Croiser thinking vs map JSON | `workspace_map_read` forcé tour 1 (déjà spec L2) |
| B-PHASE-01 | Code user dans thinking stream | Steps PHASE internal_reasoning | Gate séparation canal / strip `[phase:*]` du thinking |
| B-CTX-01 | in >> out, > 40k in | En-tête export | Métrique smoke : tours avant 1er tool structuré |
| B-EXPORT-01 | Troncature ligne 2621 | Fin `chat_qwen27b.txt` | Archive export complet obligatoire |
| B-PATH-01 | path sans `app-kdds-main` | PARTIE B args | Résolu par map read tôt |
| B-BASH-01 | `Blocked: head` | Tool result ERROR | Déjà documenté — option nudge Unix→Windows |
| B-SCOPE-01 | Pas d'internal_plan_write | Grep + build version | Re-smoke build courant |

---

## Critères de re-smoke (post-patch)

| # | Critère | Seuil |
|---|---------|-------|
| R1 | Premier `tool_call` structuré | ≤ **3** tours LLM après message user |
| R2 | Pas de texte `[tool_use]` persistant | 0 occurrence dans messages assistant structurés |
| R3 | Thinking sans « cannot read file system » | 0 occurrence après tour 5 |
| R4 | `internal_plan_write` avant autre outil | Obligatoire (build 1.4.1.3+) |
| R5 | Tokens `in` | < **25 000** pour brief identique |
| R6 | Clôture | `phase: done` + mutation vérifiée |
| R7 | Export archivé | PARTIE A + B + C sur disque |

---

## Liens

- **Plan de suivi patches** : [PLAN-PROTO-FIXES.md](1.4.1.3/PLAN-PROTO-FIXES.md) (Phase F → E)
- Plan interne L2 : [INTEGRATION-internal-plan.md](1.4.1.3/INTEGRATION-internal-plan.md)
- Smoke échec file_write : [SMOKE-ses_2e0b2a5e.md](SMOKE-ses_2e0b2a5e.md)
- Nudge continue : `drox-engine/drox/crates/drox-engine/src/agent/nudges/schema_error.rs`
- Branche post-LLM : `drox-engine/drox/crates/drox-engine/src/agent/loop/drive/outcome.rs`

---

*Document généré à partir de l'analyse croisée PARTIE A/B/C — session `ses_7d5db0f1`, export 2026-06-14T16:34:44Z.*
