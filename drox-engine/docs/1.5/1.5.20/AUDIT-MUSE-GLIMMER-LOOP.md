# Audit — boucle finale Muse Glimmer (`chat_muse_glimmer.json`)

**Statut** : audit · **Date** : 2026-08-11  
**Branche** : `1.5.20`  
**Export** : [`../exports/chat_muse_glimmer.json`](../exports/chat_muse_glimmer.json)  
**Modèle** : `drox:muse-glimmer:30b-q4_K_M-dflash`

---

## 1. Verdict court

| Question | Réponse |
|----------|---------|
| La tâche a-t-elle réussi avant la boucle ? | **Oui** — list / edits / delete / create / `node` tests OK ; todos **toutes `completed`**. |
| Où est la boucle ? | **Fin du request #2** : un bloc `thinking` de **~25 049 caractères** qui **répète** ~30× le même résumé (« C’est fait / Terminé / objectif complet… »). |
| Y a-t-il des `[phase: …]` dans tout l’export ? | **Aucun** (0 sur les 3 requests). Muse Glimmer **n’utilise pas** le protocole de phases Drox. |
| Le `LoopDetector` 1.5.19 a-t-il dû couper ça ? | **Non efficacement** — il compare des **tours LLM entiers** (empreinte exacte text+thinking+tools). Ici la dérive est **intra-stream** (même tour, paraphrases légèrement différentes → hash ≠). |
| Cause racine probable | Après succès outils, le modèle **continue à générer** dans le canal **thinking** au lieu d’émettre une réponse courte + `[phase: done]` (ou d’arrêter). Aucun garde-fou **mid-stream** sur répétition de lignes. |

---

## 2. Déroulement du run (request #2)

Demande user : modifier les fichiers test racine de façon conséquente, en supprimer un, (implicite créer / tester).

Séquence utile (outils) :

1. `todo_write` → plan 4 items  
2. `glob` / `bash dir` / `file_read` ×2  
3. Edits `test-git-diff.js` / `test-git-status.js` (`externalEdit`)  
4. `delete_path` (status) · création `test-git-merge.js`  
5. Todos → **tous completed**  
6. `bash` : `dir` · `node test-git-diff.js` · `node test-git-merge.js`  
7. **Puis** : thinking géant répétitif (~25 k) — **plus aucun outil**

Stats répétition (lignes du dernier thinking) :

| Ligne (extrait) | Occurrences |
|-----------------|-------------|
| `` `test-git-merge.js` créé de toute pièce `` | ~63 |
| `` `test-git-status.js` supprimé `` | ~62 |
| `Tests exécutés avec succès` | ~60 |
| Variantes « Terminé / C’est fait / Oui tout est fait » | ~25–30 blocs |

Un échantillon de 80 caractères du milieu du texte apparaît **~28 fois**.

Requests #0–#1 : OK (analyse + remerciement) — thinking court, pas de boucle.

---

## 3. Diagnostic technique

### 3.1 Ce que le moteur attend

Boucle agent (`agent.rs`) :

- Clôture **mécanique** sur `[phase: done]` (après answering / gates todos / testing).
- Si pas de `done` et pas d’outils → **nudge** puis **re-tour LLM**, jusqu’à `max_iterations`.
- `LoopDetector` : abort seulement si **empreinte tour** (texte + **thinking** + tool_calls) **identique** 3 strikes (après 2 warns) — cf. E18 / [ENGINE-OLLAMA-THINKING-AND-LOOPS.md](../1.5.19/ENGINE-OLLAMA-THINKING-AND-LOOPS.md).

### 3.2 Ce que Muse Glimmer fait

1. **Excellent** sur outils (todo, read, edit, bash) — d’où le ressenti « incroyable ».
2. **Ignore** `[phase: reading|answering|done|…]` (0 marqueur dans l’export).
3. Avec **thinking natif** (`think: true`), la « réponse finale » part dans **`thinking`**, pas dans le texte assistant protocole.
4. Une fois le travail fini, au lieu de s’arrêter, le décodeur **réécrit le même bilan** en boucle (mode « completion compulsive » fréquent sur certains GGUF / templates thinking).

### 3.3 Pourquoi les filets actuels ratent

| Filet | Pourquoi inopérant ici |
|-------|-------------------------|
| Gates `[phase: done]` | Jamais émis → pas de clôture propre |
| `LoopDetector` inter-tours | Variations lexicales (« C’est fait » vs « Oui, tout est fait ») → **nouvelle** empreinte → strike remis à 0 |
| Soft-timeouts history / IDE overlay | Autre sujet (chargement UI) — pas ce run |
| Max iterations | Peut finir par couper, mais **après** un (ou plusieurs) monologue(s) très long(s) — mauvaise UX |

Deux hypothèses compatibles avec l’export (non exclusives) :

| H | Description | Indices |
|---|-------------|---------|
| **H1 (primaire)** | **Boucle intra-stream** : un seul `stream_chat` qui n’émet jamais EOS / done et répète des n-grammes dans `thinking` | Un seul part `thinking` 25 k ; répétition dense |
| **H2 (secondaire)** | **Boucle inter-tours** : nudges « emit done » → nouveaux tours « Terminé… » sans outils, fingerprints proches mais ≠ | Possible si l’UI a fusionné plusieurs thinkings ; à confirmer avec logs moteur / export brut RPC |

Dans les deux cas, le **manque de protocole de phase** + **thinking comme canal de réponse** est le terrain favorable.

---

## 4. Solutions proposées (par priorité)

### S1 — Détecteur de répétition **intra-stream** (recommandé, ciblé)

Pendant `consume_stream` / accumulation thinking+texte :

- Fenêtre glissante : si la même ligne (ou n-gramme ≥ N chars) se répète **K** fois (ex. K=8–12) → **cancel** le stream.
- Traiter comme fin de tour : si todos completed + pas d’outil en cours → **clôturer le run** (ou un seul nudge done-only puis stop).

Effet : coupe la boucle Muse **pendant** la génération, pas après 25 k.

### S2 — Clôture « soft done » pour modèles thinking

Si **dans le même run** :

- dernier `todo_write` = tout `completed`, **et**
- au moins un outil de vérif (`bash` / tests) depuis, **et**
- tour courant : `tool_calls` vides,

alors :

- **Option A** : auto-`Phase::Done` (risqué si faux positif).
- **Option B (safer)** : au plus **1** nudge ultra-court (« emit only `[phase: done]` ») puis **force stop** même sans marqueur.

Évite `max_iterations` de paraphrases « C’est fait ».

### S3 — Durcir / normaliser `LoopDetector`

- Empreinte sur thinking **normalisé** (lower, collapse whitespace, strip bullets) ou similarité (Jaccard lignes) au lieu d’égalité stricte.
- Ou : si `tool_calls` vides et thinking > seuil et similarité > 0.85 avec le tour précédent → Warn/Abort plus agressif.

Complète S1 pour le cas multi-tours (H2).

### S4 — Caps tokens thinking / completion

- `num_predict` / budget thinking plus bas sur Ollama pour ce modèle, ou plafond moteur sur taille `outcome.thinking`.
- Filet grossier mais immédiat.

### S5 — Prompt / contrat modèle

- Règle explicite : *« Après outils, une courte réponse utilisateur puis `[phase: done]` en texte visible — ne répète pas le bilan dans thinking. »*
- Utile mais **insuffisant seul** (Muse a déjà ignoré toutes les phases).

### Hors scope immédiat

- Fine-tune Muse pour Drox.
- Changer le produit « phases texte » en outil `run_complete` (piste plus large, 1.5.21+).

---

## 5. Plan d’action suggéré (1.5.20)

| Phase | Livrable |
|-------|----------|
| **M0** | Cet audit (+ lien README / PLAN résiduel) |
| **M1** | Spike S1 : cancel stream sur répétition lignes thinking (tests unit n-grammes) |
| **M2** | S2-B : soft-close après todos+testing sans tools |
| **M3** | Smoke rejoué scénario « modifie tests racine » avec Muse Glimmer — thinking final < ~2–3× un bilan normal |
| **M4** | (option) S3 normalisation LoopDetector |

Critère de succès : même consigne Muse → run se termine sans monologue répétitif ; UI reçoit une clôture claire (done ou stop moteur).

---

## 6. Liens

- Export : [`../exports/chat_muse_glimmer.json`](../exports/chat_muse_glimmer.json)
- Boucles agent 1.5.19 : [ENGINE-RUST-AGENT-LOOPS.md](../1.5.19/ENGINE-RUST-AGENT-LOOPS.md)
- LoopDetector + thinking : [ENGINE-OLLAMA-THINKING-AND-LOOPS.md](../1.5.19/ENGINE-OLLAMA-THINKING-AND-LOOPS.md)
- Code : `drox-engine/drox/crates/drox-engine/src/agent.rs` (`LoopDetector`, gates `Phase::Done`, `consume_stream`)
- Résiduels IDE (autre sujet) : [AUDIT-IDE-CHAT-LOADING.md](AUDIT-IDE-CHAT-LOADING.md)
