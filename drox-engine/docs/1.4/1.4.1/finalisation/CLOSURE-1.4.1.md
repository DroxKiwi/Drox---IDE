# Clôture 1.4.1 — Stabilisation dogfood

**Date** : juin 2026  
**Branche** : `1.4.1` → fusionnée sur `main`  
**Prérequis** : [OPENING-1.4.1](OPENING-1.4.1.md) · [CLOSURE-1.4.1.3](CLOSURE-1.4.1.3.md)

---

## Verdict

Branche **1.4.1** clôturée : stabilisation moteur post-rail 1.4.0 (plans 1.4.1.1 → 1.4.1.3), **profil produit unique** (fin `engine.strictness` / `engine.tuning.*` utilisateur), **Settings IDE** scindés dev/release, doc **1.4.4** (sampling par contexte) ouverte.

La **1.4.x** reste dogfood — polish UI → [1.4.2](../../1.4.2/README.md), index → [1.4.3](../../1.4.3/README.md).

---

## Jalons livrés

| Segment | Contenu | Doc |
|---------|---------|-----|
| **1.4.1.1** | Intent probe + anglais moteur | [CLOSURE-1.4.1.1](CLOSURE-1.4.1.1.md) |
| **1.4.1.2** | Patch rail / VERIFY / outils | [CLOSURE-1.4.1.2](CLOSURE-1.4.1.2.md) |
| **1.4.1.3** | Context frame · tool folders · plan interne L2 | [CLOSURE-1.4.1.3](CLOSURE-1.4.1.3.md) |
| **Profil unique** | `EngineTuning::product_default()`, RPC legacy ignoré | `orchestration/tuning/mod.rs` |
| **Settings** | Catalogue prod ~15 clés ; LLM avancé + `executablePath` dev-only (Settings IDE, pas vignette chat) | `droxDevConfiguration.ts` |
| **1.4.4** | Spec profils sampling YAML (planifié) | [1.4.4](../../1.4.4/README.md) |

---

## Tests (dernier état connu)

| Suite | Résultat |
|-------|----------|
| `cargo test -p drox-engine` | ✅ ~313 tests |
| `cargo test -p drox-cli` | ✅ ~95 tests |
| `droxDevSurface` / `droxCommon` (partiel) | ✅ profil RPC sans `engineTuning` |

---

## Suite sur `main`

1. [1.4.2](../../1.4.2/README.md) — UI chat  
2. [1.4.3](../../1.4.3/README.md) — index / graphe  
3. [1.4.4](../../1.4.4/PLAN-1.4.4.md) — `llm-sampling.yaml` (dev)  
4. Smokes multi-runs Qwen 27B — voir [SMOKE-ses_733093c6-SESSION.md](../SMOKE-ses_733093c6-SESSION.md)
