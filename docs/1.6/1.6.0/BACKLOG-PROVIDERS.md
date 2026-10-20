# Providers LLM — notes & correctifs

## Mistral AI — chat 422 après liste modèles ✅ corrigé (1.6.0)

**Symptôme** (dogfood 1.5.23) : connexion Cloud Mistral OK, modèles listés (`ministral-14b-latest`), chat → **422**.

```text
POST https://api.mistral.ai/v1/chat/completions → 422
- body.top_p : Input should be greater than 0 (reçu 0.0)
- body.seed  : Extra inputs are not permitted (reçu 0)
```

**Cause** (doc officielle [Chat](https://docs.mistral.ai/api/#tag/chat)) :

| Drox envoyait | Mistral attend |
|---------------|----------------|
| `seed` | **`random_seed`** |
| `top_p: 0.0` | omit ou **`top_p > 0`** (validation runtime stricte) |

**Fix** : dialecte `OpenAiCompatDialect::Mistral` dans `drox-llm` — adaptateur `adapters/mistral.rs` :

- `seed` → wire `random_seed` (pas de champ `seed`)
- `top_p <= 0` / non-fini → omis

**Smoke** : Cloud Mistral → 1 tour chat avec `topP=0` / `seed=0` en settings ne doit plus 422.
