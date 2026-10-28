# La boucle de l’agent — pourquoi Drox « recommence » avant de s’arrêter

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : la **boucle** au cœur du moteur (`drive_inner`). C’est elle qui, après chaque réponse du modèle (texte et/ou appels d’outils), décide : *on a fini ?* sinon *on rappelle le modèle*.

Tout au long de ce texte, nous détaillerons **petit à petit** le code pour expliquer :

- **comment** on écrit une boucle et des conditions en Rust ;
- **pourquoi** le moteur ne s’arrête pas « quand le modèle se tait » ;
- **à quoi ça sert** dans le chat (phases, outils, nudges) ;
- **comment** le **profil moteur** (`EngineProfile`) change la règle de fin.

Si les mots *variable*, *fonction*, *struct* ne sont pas encore clairs, commence par le socle : [01-contact-ollama.md](01-contact-ollama.md). On les réutilise ici sans tout redéfinir.

### L’histoire en une phrase

Un run Drox, ce n’est **pas** un seul appel à Ollama. C’est une **conversation contrôlée** : appeler le modèle → éventuellement exécuter des outils → réinjecter les résultats → rappeler le modèle → … jusqu’à une **clôture** valide.

- En **`cloud-full`** : le modèle doit signer **`[phase: done]`** (après `answering`, gates todos/testing, etc.).
- En **`local-9b` / `local-27b`** : un tour **sans outil** suffit souvent — le moteur **clôt** sans exiger `done` (CORE allégé).

Réglage IDE / RPC : `engineProfile` — voir [07-phases-et-gates.md](07-phases-et-gates.md).

### Fichiers à laisser ouverts

| Fichier | Rôle |
|---------|------|
| [`agent/run/drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs) | **`drive_inner`** — boucle, branches fin / tools / nudges |
| [`agent/consume_llm_stream.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/consume_llm_stream.rs) | `consume_stream` — parse flux + `[phase:…]` |
| [`agent/config.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs) | `AgentConfig`, `EngineProfile`, `max_iterations` |
| [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs) | Forme des événements émis |
| [agent-run-loop.md](../engine/agent-run-loop.md) | Référence courte (sans le fil pédagogique) |

```text
pour chaque itération (0 .. max_iterations) :
    préparer / snip le contexte
    appeler stream_chat          ← vu dans le guide 01
    lire le flux (consume_stream)
    si profil local + tour sans tool → clôture moteur (Stop)
    sinon si [phase: done] + gates OK → sortir          (cloud-full)
    sinon exécuter les tools
    sinon (pas de tools) → nudge et continuer
```

---

## Partie A — Qu’est-ce qu’une boucle ? (idée machine)

Une **boucle**, c’est dire à la machine : « **répète** ce bloc d’instructions tant qu’une condition est vraie » (ou un nombre de fois fixé).

Sans boucle, le programme ferait **un seul** tour LLM puis s’arrêterait — inutilisable dès qu’il faut lire un fichier puis répondre.

En Rust, une forme fréquente :

```rust
for iter in 0..max_iterations {
    // corps répété
}
```

| Élément | Sens |
|---------|------|
| `for` | Mot-clé de boucle « pour chaque… » |
| `iter` | Variable locale : le numéro du tour (0, 1, 2, …) |
| `0..max_iterations` | **Intervalle** : de 0 inclus jusqu’à `max_iterations` **exclu** |
| `{ … }` | Corps : ce qui est répété |

**Côté machine** : le processeur revient au début du bloc, incrémente `iter`, et reteste si on a encore le droit de continuer. Quand `iter` atteint la borne, on sort.

### `max_iterations` — deux défauts à connaître

| Source | Valeur typique | Rôle |
|--------|----------------|------|
| `AgentConfig::default()` (Rust) | **12** | Tests / TUI / défaut struct |
| `agent.run` depuis l’IDE | souvent **200** | Filet large pour gros chantiers |

Dans les deux cas, c’est un **plafond** : même sans clôture propre, on ne tourne pas à l’infini.

### Exemple concret — la boucle dans `drive.rs`

Fichier : [`agent/run/drive.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs) — cherche `for iter in 0..self.config.max_iterations`.

```rust
for iter in 0..self.config.max_iterations {
    debug!(iter, /* … flags todos … */, "tour LLM …");

    if self
        .maybe_snip(&mut messages, &tx, &mut live_compaction_seq)
        .await
        .is_err()
    {
        return;
    }

    let options = self
        .config
        .chat_options
        .clone()
        .with_tools(tool_specs.clone());

    let stream = match self.llm.stream_chat(messages.clone(), options).await {
        Ok(s) => s,
        Err(err) => {
            let _ = tx.send(Err(err.into())).await;
            return;
        }
    };

    let native_thinking_ui = self.config.chat_options.think == Some(true);

    let Ok(mut outcome) = consume_stream(stream, &tx, native_thinking_ui).await else {
        return; // canal consommateur fermé
    };
    // … suite : clôture locale / gates done / tools / nudges …
}
```

| Ligne / morceau | Lecture détaillée |
|-----------------|-------------------|
| `for iter in 0..self.config.max_iterations` | `self` = l’`Agent` ; on lit le champ `config`, puis `max_iterations` (un entier). `0..N` produit 0, 1, …, N−1. |
| `debug!(iter, …)` | Macro **tracing** : écrit un log structuré (pas affiché dans le chat). Utile pour déboguer combien de tours ont tourné. |
| `maybe_snip(&mut messages, &tx, …).await` | Implémenté dans [`run/lifecycle.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/run/lifecycle.rs). Si le canal UI est mort → `return`. |
| `let options = …clone().with_tools(…)` | On **copie** les options de chat du run, puis on y attache la liste d’outils de ce tour (vu en [01](01-contact-ollama.md)). |
| `match self.llm.stream_chat(…).await` | Appel au trait `LlmClient` ; deux issues `Ok` / `Err`. |
| `consume_stream(…).await` | Fonction dans [`consume_llm_stream.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/consume_llm_stream.rs). |

Le défaut `max_iterations: 12` est dans [`config.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/config.rs) (`impl Default for AgentConfig`).

### Sortir plus tôt : `return` / `break`

- `return` dans `drive_inner` : quitte **toute la fonction** (fin du run pour cette tâche).
- On peut aussi imaginer `break` pour sortir seulement de la boucle `for` (selon les branches du code réel).

---

## Partie B — Qu’est-ce qu’une condition ?

Une **condition**, c’est une question oui/non (`bool` : `true` / `false`).

```rust
if phase_is_done && gates_ok {
    // sortir proprement (cloud-full)
} else {
    // continuer : tools ou nudge
}
```

| Élément | Sens |
|---------|------|
| `if` | Si la condition est vraie, exécute le premier bloc |
| `&&` | « Et » logique : les deux doivent être vrais |
| `else` | Sinon, l’autre bloc |

Dans `drive_inner`, les conditions portent sur : profil **local** + tour sans tool ? `[phase: done]` ? todos fermés ? testing ? répétition (`LoopDetector`) ?

---

## Partie C — L’état qui change d’un tour à l’autre

Entre deux appels à Ollama, le moteur **modifie** des variables :

- `messages` : l’historique s’allonge (réponse assistant, résultats d’outils) ;
- compteurs / **`LoopDetector`** (anti-répétition) ;
- objectif de run, todos, situation card, etc.

D’où des `let mut messages` : la **même** variable désigne une liste qui **grandit**.

Sans cet état mutable partagé dans la fonction, chaque tour LLM « oublierait » ce que les tools viennent de faire.

---

## Partie D — Anatomie d’un tour dans `drive_inner` (lecture guidée)

Ouvre [`drive_inner`](../../drox-engine/drox/crates/drox-engine/src/agent/run/drive.rs) et suis ce scénario pour **un** `iter` :

1. **Budget contexte** — `maybe_snip` (lifecycle) : réduire l’historique trop gros.
2. **Appel modèle** — `self.llm.stream_chat(...).await` (guide [01](01-contact-ollama.md)).
3. **Lecture du flux** — `consume_stream` → `AgentEvent` + `TurnOutcome`.
4. **Clôture locale** (profils `local-*`) — tour sans `tool_call` → souvent **Stop** immédiat ([`loop_close/engine_closure.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/loop_close/engine_closure.rs)).
5. **Branche `done`** (**`cloud-full`**) — `[phase: done]` + gates OK → Stop.
6. **Branche outils** — `tool_calls` : pre-gates → permissions → execute → résultats dans `messages`.

```rust
let batches = partition_tool_calls(&tool_names, &self.registry);
```

`partition_tool_calls` — détail [10](10-parallelisme-outils.md) · module [`tools/orchestration.rs`](../../drox-engine/drox/crates/drox-engine/src/tools/orchestration.rs).

7. **Branche nudge** — pas de fin valide, pas d’outil : message `system` (`NUDGE_PROMPT`, `DONE_ONLY`, …) puis nouvel `iter`.

### Deux philosophies de clôture (`tui_mono`)

| Profil | Signal de fin typique |
|--------|------------------------|
| **`cloud-full`** | **`[phase: done]`** après `answering` ; sinon nudges jusqu’à `max_iterations` ou escalade anti-boucle |
| **`local-9b` / `local-27b`** | Tour **sans outil** = réponse finale ; `done` **non requis** ; `local-27b` peut encore injecter un rappel one-shot (todos / testing) |

Ancienne intuition naïve : « pas d’outil = fini » — **vrai en local**, **faux en cloud-full**.

Détails : [system-prompts-and-phases.md](../engine/system-prompts-and-phases.md) · [agent-internals.md](../engine/agent-internals.md).

---

## Partie E — Boucle *dans* la boucle : lire le stream

Dans [`consume_llm_stream.rs`](../../drox-engine/drox/crates/drox-engine/src/agent/consume_llm_stream.rs) — fonction `consume_stream` :

```rust
while let Some(event) = stream.next().await {
    match event {
        Ok(StreamEvent::Start) => {}
        Ok(StreamEvent::ThinkingDelta { text: delta }) => {
            // … forward vers l’UI / buffers …
        }
        // … TextDelta, ToolCall, Stop, Err …
    }
}
```

| Élément | Sens |
|---------|------|
| `while` | Répète **tant que** le pattern réussit |
| `stream.next().await` | Prochain événement du flux ; `None` = fin du stream |
| `match event` | Traitement selon le type (`Start`, texte, tool…) |

- **Tour** (`for iter`) : une pensée complète + tools.
- **Stream** (`while let`) : les tokens d’*une* réponse.

---

## Partie F — Lien avec ce que tu vois dans l’IDE

À chaque étape, `drive_inner` envoie des événements (`tx`).  
L’IDE les reçoit (JSON-RPC `agent/event`) et met à jour le fil.  
Guide [04-moteur-et-affichage.md](04-moteur-et-affichage.md).

---

## Récapitulatif

1. Boucle `for` bornée par **`max_iterations`** (12 en struct, souvent plus via l’IDE).
2. Chaque tour : LLM → stream → **clôture locale ou gates `done`** / tools / nudge.
3. État **`messages`** mutable entre les tours.
4. **`EngineProfile`** choisit quelle règle de fin s’applique.

## Suite

- [03-gestion-erreurs.md](03-gestion-erreurs.md) — échecs de tour · escalade anti-boucle
- [07-phases-et-gates.md](07-phases-et-gates.md) — protocole `[phase:]` et nudges
- [04-moteur-et-affichage.md](04-moteur-et-affichage.md) — événements → chat

Index : [README.md](README.md).
