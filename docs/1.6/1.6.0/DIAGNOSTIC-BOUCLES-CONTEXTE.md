# Diagnostic — boucles agent & explosion de contexte

**Statut** : baseline figée à l’ouverture de **1.6.0** (analyse statique, pas encore de patch)  
**Symptômes dogfood** : réponses identiques 2–3× ; runs qui n’aboutissent pas ; jauge ~78k → ~162k au message suivant ; reproduit sur 15–30B locaux et GLM-5.3-flash.

---

## 1. Verdict

| Intuition | Lecture |
|-----------|---------|
| Défaut de conception moteur | **Fort** — compaction non durable + protocole `done` + nudges qui relancent |
| Modèles hypersensibles aux boucles | **Vrai, secondaire** — amplificateur connu (IAL) |
| Doublons / priorités system | **Probable** — reminders mid-run → faux « user » |
| 78k → 162k = injection mal gérée | **Oui, en 2 couches** — jauge trompeuse + transcript non compacté au reload |

Ce n’est pas « tous les modèles sont cassés ». C’est « le moteur pousse le modèle dans un attracteur de boucle ».

---

## 2. Assemblage du prompt (par `agent.run`)

1. **IDE** — notes session (plafond ~12 KiB) · régulation L1–L5 · hint L5 · bloc `@Codebase`  
2. **Moteur** — `MEMORY.md` + `DROX.md` (sans plafond) · gros system Drox · skills / ignore / workspace map · langue / tools  
3. **Historique** — JSONL **complet** (pas la limite UI 25 tours)  
4. **User** — nouveau message  
5. **Tools** — schemas en options d’appel (pas des messages)

Mid-run : les nudges `Message::system` sont convertis, côté OpenAI/Ollama, en messages **user** préfixés `[System reminder]`  
(`drox-llm` openai/request.rs · ollama/stream.rs).

---

## 3. Boucle drive (sans nouveau user turn)

Fichier clé : `drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs`

- Un seul `agent.run` peut rappeler le modèle jusqu’à `max_iterations` (défaut **12**).  
- Seul `[phase: done]` (avec gates satisfaites) termine proprement.  
- Absent de tool **et** de `done` → nudge + `continue`.  
- `answering` sans `done` → `DONE_ONLY_NUDGE` + **`loop_detector.reset()`**.  
- Nudge générique sans tool → aussi **`loop_detector.reset()`**.  
- Todo ouverte après `done` : ne reset **pas** le detector (déjà corrigé sur cette branche de code).

Conséquence : un modèle qui omet `done` régénère souvent la même réponse « déterministe » ; le detector est remis à zéro au pire moment.

### LoopDetector — portée réelle

`drox-engine/.../agent/loop_detect.rs`

| Cas | Comportement |
|-----|--------------|
| Même texte+thinking+tools ×4 | Abort |
| Même texte, thinking différent | Non détecté |
| Entre deux `agent.run` | État perdu (recréé) |
| Après nudge qui `reset()` | Compteur à zéro |
| Thrashing bash/grep | Mieux couvert (normalisation) |

---

## 4. Compaction live vs disque

| Chemin | Compacte en RAM | Réécrit le transcript |
|--------|-----------------|------------------------|
| TUI `/compact` / live | oui | **oui** (`rewrite_transcript`) |
| IDE JSON-RPC (`maybe_snip` / live) | oui | **non** (event `ContextCompacted` seulement) |

Fichiers : `compaction/live.rs` · `agent/run/lifecycle.rs` · `drox-tui/.../commands.rs` · `drox-cli/.../handlers/mod.rs` (reload JSONL au prochain run).

Symptôme attendu : contexte « raisonnable » pendant un run compacté → **explosion** au message user suivant.

`/compact` session côté tool : résumé retourné mais **pas** de `write_transcript` durable sur le chemin IDE (à vérifier / aligner en 1.6.0).

---

## 5. Jauge tokens 78k → 162k

1. Avant appel : estimation `RoughTokenCounter` ≈ `bytes / 4` (`drox-context/src/tokens.rs`).  
2. Après réponse : `usage.input_tokens` fournisseur écrase `ctx` (`handlers/mod.rs` TurnUsage / Stop).  
3. Sur code/JSON, `bytes/4` sous-estime souvent → ratio ~2× d’**affichage** possible sans doublement réel.  
4. Cumulé avec H1 (reload non compacté) → saut réel possible aussi.

---

## 6. Accumulateurs secondaires

- `file_read` jusqu’à **512 KiB** en un résultat.  
- Sous-agent Explore / `task` : rapport concaténé, **hors** microcompact.  
- Jusqu’à 3 résultats récents protégés du snip.  
- MEMORY/DROX/notes/régulation/@Codebase = **coût fixe** chaque run (pas des doublons JSONL, mais plancher élevé).

---

## 7. Communauté (IAL)

- Papier [*When Agents Do Not Stop*](https://arxiv.org/html/2607.01641) — Infinite Agentic Loops structurels.  
- Issues DeerFlow / Microsoft Agent Framework — tool loops jusqu’au recursion limit.  
- Docs Pi / OpenClaw / Praison — compaction = **checkpoint persisté** (summary + tail), sinon explosion au resume.

---

## 8. Preuves à collecter en dogfood

1. Export / log du `messages[]` **exact** envoyé au LLM à chaque itération d’un run qui boucle.  
2. Comparer `estimated` vs `provider_input_tokens` au même instant.  
3. Après un run qui a émis `ContextCompacted`, vérifier la taille du JSONL session sur disque.  
4. Compter les nudges `[System reminder]` dans le transcript d’un run « collé ».

Sans OBS, on peut quand même patcher COMPACT/LOOP avec tests unitaires moteur ; OBS reste le juge de paix en prod.
