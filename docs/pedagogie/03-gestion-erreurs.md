Rédigé à l'aide de Cursor Agent

# Quand ça échoue — `Result`, `?` et les erreurs dans Drox

## Introduction — ce qu’on va faire ensemble

Ici, nous allons voir **comment une partie précise de Drox fonctionne** : la **gestion d’erreurs**. Réseau coupé, modèle inconnu, outil refusé, JSON invalide… le moteur doit **signaler** l’échec sans planter toute la machine de façon obscure.

Tout au long de ce texte, nous détaillerons :

- **ce qu’est** un succès vs un échec en Rust (`Result`) ;
- **comment** on propage une erreur avec `?` ;
- **pourquoi** ce modèle évite les « pointeurs nuls » et beaucoup d’exceptions surprises ;
- **à quoi ça sert** dans Drox (message d’erreur dans le chat, run `error` / `cancelled`).

Socle recommandé : [01-contact-ollama.md](01-contact-ollama.md) (variables, fonctions). Boucle : [02-boucle-agent.md](02-boucle-agent.md).

### L’histoire en une phrase

Presque toute opération « dangereuse » (réseau, parse, config) renvoie soit **OK + une valeur**, soit **Err + une explication**. Le code au-dessus décide : corriger, informer l’utilisateur, ou arrêter le run.

### Fichiers utiles

| Fichier | Rôle |
|---------|------|
| [`ollama/stream.rs`](../../drox-engine/drox/crates/drox-llm/src/ollama/stream.rs) | Erreurs HTTP Ollama |
| [`client.rs`](../../drox-engine/drox/crates/drox-llm/src/client.rs) | `stream_chat` → `Result<…, LlmError>` |
| [`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs) | `match` sur erreur LLM dans `drive_inner` |
| [`handlers.rs`](../../drox-engine/drox/crates/drox-cli/src/jsonrpc/handlers.rs) | Erreurs RPC / config |
| Crate `thiserror` (dépendance) | Définir des types d’erreur lisibles |

---

## Partie A — Deux issues possibles : `Result`

En Rust, le type **`Result<T, E>`** signifie :

- `Ok(valeur)` — succès, la valeur est de type `T` ;
- `Err(erreur)` — échec, l’explication est de type `E`.

Analogie : un colis. Soit tu reçois le contenu (`Ok`), soit tu reçois un avis « destinataire inconnu » (`Err`). Tu es **forcé** de regarder lequel — le compilateur râle si tu ignores le `Result`.

Exemple simplifié :

```rust
fn parse_port(texte: &str) -> Result<u16, String> {
    texte.parse().map_err(|e| format!("port invalide: {e}"))
}
```

| Élément | Sens |
|---------|------|
| `-> Result<u16, String>` | Soit un nombre de port, soit un message d’erreur |
| `.map_err(...)` | Transforme le type d’erreur (détail technique → texte clair) |

**Côté machine** : un `Result` est souvent une petite structure avec une étiquette (ok/err) + la donnée associée. Pas de magie : juste une valeur comme une autre, que le typage t’oblige à traiter.

### Exemple concret — erreur LLM dans la boucle

Même extrait que le guide 02, zoom sur le `match` ([`agent.rs`](../../drox-engine/drox/crates/drox-engine/src/agent.rs)) :

```rust
let stream = match self.llm.stream_chat(messages.clone(), options).await {
    Ok(s) => s,
    Err(err) => {
        let _ = tx.send(Err(err.into())).await;
        return;
    }
};
```

| Morceau | Détail |
|---------|--------|
| `stream_chat(…).await` | Renvoie `Result<StreamHandle, LlmError>` |
| `Ok(s) => s` | Succès : on extrait le flux et on le met dans `stream` |
| `Err(err)` | Échec : timeout, 404, JSON invalide… |
| `err.into()` | Conversion d’erreur (`LlmError` → erreur moteur/`EngineError` via le trait `From`) |
| `tx.send(Err(…))` | Notifie l’UI **avant** de mourir |
| `let _ = …` | On ignore volontairement si l’envoi au canal échoue aussi (UI déjà partie) |
| `return` | Quitte `drive_inner` : plus de tours |

Ici on n’utilise **pas** `?` : on veut ce traitement local (pousser vers `tx`) avant de sortir.

---

## Partie B — Le raccourci `?`

Tu as déjà vu dans le guide 01 :

```rust
let response = self.http.post(url.clone()).json(&payload).send().await?;
```

Le **`?`** veut dire :

1. Si le résultat est `Err(...)`, **quitte immédiatement** la fonction en renvoyant cette erreur (éventuellement convertie).
2. Si c’est `Ok(valeur)`, **déballe** la valeur et continue.

Sans `?`, il faudrait écrire un `match` à chaque ligne. Avec `?`, le happy path reste lisible ; les échecs remontent vers celui qui sait quoi afficher.

**Condition** : la fonction qui contient le `?` doit elle-même renvoyer un `Result` (ou un type compatible).

---

## Partie C — `Option` : l’absence n’est pas une erreur

`Option<T>` = `Some(valeur)` ou `None` (pas de valeur).  
Ce n’est **pas** forcément un bug : une clé API absente, un champ JSON omis…

```rust
if let Some(k) = api_key {
    // on a une clé
}
```

| Situation | Type fréquent |
|-----------|----------------|
| « Peut-être rien, et c’est normal » | `Option` |
| « Ça a échoué, il faut réagir » | `Result` |

On convertit parfois `Option` → `Result` avec `.ok_or(...)` : « `None` devient une vraie erreur ».

---

## Partie D — Dans Drox : trois étages d’erreurs

### 1. Couche LLM (`LlmError`)

`stream_chat` renvoie `Result<StreamHandle, LlmError>`.  
Exemples d’échecs : URL invalide, HTTP 404/500, timeout, JSON de chunk illisible.

Dans `drive_inner` (forme déjà vue) :

```rust
let stream = match self.llm.stream_chat(messages.clone(), options).await {
    Ok(s) => s,
    Err(err) => {
        let _ = tx.send(Err(err.into())).await;
        return;
    }
};
```

Lecture humaine :

- succès → on garde le flux `s` ;
- échec → on **pousse** l’erreur vers le canal UI (`tx`), puis on **arrête** cette tâche agent.

Ici on n’utilise pas `?` : on veut un traitement local (notifier l’UI) avant de sortir.

### 2. Couche RPC (`RpcError`)

Côté `handlers.rs`, une mauvaise config devient une erreur JSON-RPC pour l’IDE :

```rust
let llm = create_llm_client(params.provider.as_deref(), llm_config)
    .map_err(|e| RpcError::new(CONFIG_ERROR, format!("LLM init failed: {e}")))?;
```

| Morceau | Détail |
|---------|--------|
| `create_llm_client(…)` | Renvoie `Result<Arc<dyn LlmClient>, LlmError>` |
| `.map_err(\|e\| RpcError::new(…))` | Transforme l’erreur LLM en erreur **RPC** avec un message lisible pour l’IDE |
| `format!("… {e}")` | Construit une `String` en interpolant l’erreur |
| `?` | Si toujours `Err` après conversion → quitte `build_agent_setup` en renvoyant cette `RpcError` |

L’IDE peut alors afficher « LLM init failed: … » au lieu d’un silence.

### 3. Couche outil / permissions

Un tool peut renvoyer `is_error: true` dans son résultat : ce n’est pas toujours une panique du process — souvent le **modèle** reçoit le message d’échec et peut réessayer autrement.  
Une permission `Deny` suit la même idée : résultat contrôlé, pas crash.

---

## Partie E — Types d’erreur dédiés (`thiserror`)

Les crates Drox définissent des enums d’erreur (souvent avec la dérive **thiserror**) du genre :

```rust
// forme illustrative
enum LlmError {
    Api { status: u16, body: String, url: String },
    // …
}
```

Avantage : chaque variante porte les **données utiles** (status HTTP, URL…).  
Quand tu débogues, tu sais *pourquoi* ça a cassé, pas seulement « error ».

---

## Partie F — Erreur ≠ annulation

| Situation | Idée |
|-----------|------|
| `Err(...)` / status `error` | Quelque chose s’est mal passé |
| `agent.cancel` / status `cancelled` | L’humain (ou le client) a demandé l’arrêt |
| `LoopDetected` | Le moteur refuse de continuer une boucle stérile |

Trois façons différentes de **finir** un run — l’UI peut les afficher différemment.

---

## Récapitulatif

1. **`Result`** force à traiter succès et échec.
2. **`?`** remonte l’erreur ; **`match`** permet un traitement local (notifier le chat).
3. **`Option`** = absence possible ; ce n’est pas toujours une erreur.
4. Drox empile LLM → agent/canal → RPC IDE, avec des messages de plus en plus « humains ».

## Suite

- [04-moteur-et-affichage.md](04-moteur-et-affichage.md) — comment une `Err` devient un message visible.
- Référence : [jsonrpc-protocol.md](../engine/jsonrpc-protocol.md) (`agent/done` avec `status`).

Index : [README.md](README.md).
