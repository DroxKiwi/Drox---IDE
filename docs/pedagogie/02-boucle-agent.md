# La boucle de l’agent — pourquoi Drox « recommence » jusqu’à `done`

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : la **boucle** au cœur du moteur (`drive_inner`). C’est elle qui, après chaque réponse du modèle (texte et/ou appels d’outils), décide : *on a fini ?* sinon *on rappelle le modèle*.

Tout au long de ce texte, nous détaillerons **petit à petit** le code pour expliquer :

- **comment** on écrit une boucle et des conditions en Rust ;
- **pourquoi** le moteur ne s’arrête pas « quand le modèle se tait » ;
- **à quoi ça sert** dans le chat (phases, outils, nudges).

Si les mots *variable*, *fonction*, *struct* ne sont pas encore clairs, commence par le socle : [01-contact-ollama.md](01-contact-ollama.md). On les réutilise ici sans tout redéfinir.

### L’histoire en une phrase

Un run Drox, ce n’est **pas** un seul appel à Ollama. C’est une **conversation contrôlée** : appeler le modèle → éventuellement exécuter des outils → réinjecter les résultats → rappeler le modèle → … jusqu’à ce que le modèle signe la fin avec `[phase: done]` (et que les règles internes soient respectées).

### Fichiers à laisser ouverts

| Fichier | Rôle |
|---------|------|
| [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) | `drive_inner`, gates, nudges, `consume_stream` |
| [`event.rs`](../../drox-engine/drox/crates/drox-engine/src/event.rs) | Forme des événements émis |
| [agent-run-loop.md](../engine/agent-run-loop.md) | Référence courte (sans le fil pédagogique) |

```text
pour chaque itération (0 .. max_iterations) :
    préparer / snip le contexte
    appeler stream_chat          ← vu dans le guide 01
    lire le flux (consume_stream)
    si [phase: done] + gates OK → sortir
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

Dans Drox, `max_iterations` (souvent autour de **12** par défaut dans `AgentConfig`) est un **filet de sécurité** : même si le modèle n’émet jamais `done`, on ne tourne pas à l’infini.

### Exemple concret — la vraie boucle dans `agent.rs`

Fichier : [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) (autour des lignes 1057–1106).

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
    // … suite : gates done / tools / nudges …
}
```

| Ligne / morceau | Lecture détaillée |
|-----------------|-------------------|
| `for iter in 0..self.config.max_iterations` | `self` = l’`Agent` ; on lit le champ `config`, puis `max_iterations` (un entier). `0..N` produit 0, 1, …, N−1. |
| `debug!(iter, …)` | Macro **tracing** : écrit un log structuré (pas affiché dans le chat). Utile pour déboguer combien de tours ont tourné. |
| `maybe_snip(&mut messages, &tx, …).await` | Appel **async** : peut modifier `messages` (d’où `&mut`). Si ça renvoie `Err` (souvent : plus personne n’écoute le canal UI), on `return`. |
| `.is_err()` | Méthode sur `Result` : « est-ce un échec ? » → `bool`. |
| `let options = …clone().with_tools(…)` | On **copie** les options de chat du run, puis on y attache la liste d’outils de ce tour (vu en [01](01-contact-ollama.md)). |
| `match self.llm.stream_chat(…).await` | Appel au trait `LlmClient` ; deux issues `Ok` / `Err`. |
| `tx.send(Err(err.into())).await` | En cas d’échec réseau/LLM : on pousse l’erreur vers l’UI via le canal, puis on quitte. |
| `consume_stream(…).await` | Lit le flux token par token (voir plus bas). `let Ok(mut outcome) = … else { return }` = si ça échoue doucement, stop. |

Le défaut `max_iterations: 12` est dans `impl Default for AgentConfig` (même fichier, ~L786).

### Sortir plus tôt : `return` / `break`

- `return` dans `drive_inner` : quitte **toute la fonction** (fin du run pour cette tâche).
- On peut aussi imaginer `break` pour sortir seulement de la boucle `for` (selon les branches du code réel).

---

## Partie B — Qu’est-ce qu’une condition ?

Une **condition**, c’est une question oui/non (`bool` : `true` / `false`).

```rust
if phase_is_done && gates_ok {
    // sortir proprement
} else {
    // continuer : tools ou nudge
}
```

| Élément | Sens |
|---------|------|
| `if` | Si la condition est vraie, exécute le premier bloc |
| `&&` | « Et » logique : les deux doivent être vrais |
| `else` | Sinon, l’autre bloc |

Dans `drive_inner`, les conditions portent sur : y a-t-il un `[phase: done]` ? les todos sont-ils fermés ? faut-il passer par `testing` ? le modèle a-t-il rappelé les mêmes outils en boucle ?

---

## Partie C — L’état qui change d’un tour à l’autre

Entre deux appels à Ollama, le moteur **modifie** des variables :

- `messages` : l’historique s’allonge (réponse assistant, résultats d’outils) ;
- parfois des compteurs / détecteurs de boucle (`LoopDetector`) ;
- l’objectif de run, les todos, etc.

D’où des `let mut messages` : la **même** variable désigne une liste qui **grandit**.  
**Côté machine** : les casiers mémoire de ce `Vec` sont réalloués si besoin ; le nom `messages` continue de pointer vers la liste courante.

Sans cet état mutable partagé dans la fonction, chaque tour LLM « oublierait » ce que les tools viennent de faire.

---

## Partie D — Anatomie d’un tour dans `drive_inner` (lecture guidée)

Ouvre `drive_inner` dans [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) et suis ce scénario mental pour **un** `iter` :

1. **Budget contexte** — éventuellement `maybe_snip` : on réduit l’historique trop gros (idée : ne pas envoyer 200k tokens si le modèle n’en tient que 32k).
2. **Appel modèle** — `self.llm.stream_chat(...).await` (détail dans [01](01-contact-ollama.md)).
3. **Lecture du flux** — `consume_stream` : transforme tokens / tool_calls / lignes `[phase:…]` en `AgentEvent` + un `TurnOutcome` local.
4. **Branche fin** — si le modèle a signé `done` **et** que les **gates** sont OK → fin du run (succès).
5. **Branche outils** — s’il y a des `tool_calls` : permissions → exécution (local ou `tool/exec`) → résultats ajoutés à `messages`.

```rust
// plus bas dans le même for iter (~L1454)
let batches = partition_tool_calls(&tool_names, &self.registry);
```

`partition_tool_calls` découpe en lots parallèles / série — détail dans [10](10-parallelisme-outils.md).

6. **Branche nudge** — s’il n’y a ni fin valide ni outils utiles : le moteur injecte un message système du genre « tu dois émettre `[phase: done]` » ou « ferme tes todos », puis **repart** pour un nouvel `iter`.

### Pourquoi « done-driven » ?

Ancienne intuition naïve : « pas d’outil = fini ».  
Chez Drox actuel (`tui_mono`) : **seul** `[phase: done]` (après un `answering` correct, etc.) est le signal d’arrêt officiel. Sinon le moteur **relance**. C’est pour éviter les réponses à moitié terminées qui laissent le chat dans le flou.

Les détails des gates : [system-prompts-and-phases.md](../engine/system-prompts-and-phases.md) et [agent-internals.md](../engine/agent-internals.md).

---

## Partie E — Boucle *dans* la boucle : lire le stream

Dans le vrai code (`consume_stream`, ~L2761) :

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
| `stream.next().await` | Demande le **prochain** événement du flux (async) ; renvoie `None` à la fin |
| `let Some(event) = …` | S’il y a un événement, on le nomme `event` et on entre dans le corps |
| `match event` | Selon le **type** d’événement (`Start`, texte, tool…), on fait différent traitement |
| `Ok(StreamEvent::ThinkingDelta { text: delta })` | Pattern : succès + variante enum ; `delta` = le bout de texte thinking |

C’est une boucle **sur le temps** (arrivée des données), imbriquée dans la boucle **sur les tours** de raisonnement :

- **Tour** (`for iter`) : une « pensée » complète + tools.
- **Stream** (`while let`) : les tokens d’*une* réponse.

---

## Partie F — Lien avec ce que tu vois dans l’IDE

À chaque étape intéressante, `drive_inner` envoie des événements dans un canal (`tx`).  
L’IDE les reçoit (après JSON-RPC) et met à jour le fil.  
Le guide [04-moteur-et-affichage.md](04-moteur-et-affichage.md) détaille ce tuyau ; ici retiens : **la boucle produit un flux d’événements**, pas seulement un gros texte final.

---

## Récapitulatif

1. Une **boucle** `for` borne le nombre de tours (`max_iterations`).
2. Chaque tour : LLM → lecture stream → fin / tools / nudge.
3. L’**état** (`messages`, …) est **mutable** d’un tour à l’autre.
4. L’arrêt propre est **signé** (`[phase: done]` + gates), pas « silence du modèle ».

## Suite

- [03-gestion-erreurs.md](03-gestion-erreurs.md) — que se passe-t-il quand un tour échoue ?
- [04-moteur-et-affichage.md](04-moteur-et-affichage.md) — comment ces événements deviennent du chat.

Index : [README.md](README.md).

