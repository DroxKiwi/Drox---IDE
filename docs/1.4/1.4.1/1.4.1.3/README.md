# Context Frame — hub

**Statut** : **Phase 2** — iteration + nudges centralisés · gate G-spec en attente — juin 2026  
**Prérequis** : [1.4.1.2](../PLAN-1.4.1.2.md) code clôturé · debunk [`ses_4b2c1d08`](../SMOKE-ses_4b2c1d08.md)

---

## En une phrase

Centraliser **l’ordre et le contenu** des injections system (Context Frame), introduire des **dossiers d’outils** à la demande, et un **plan interne modèle** détaillé (5–20 étapes) — **sans réécrire le moteur** : d’abord spec + vérification, puis intégration incrémentale.

---

## Documents

| Doc | Rôle |
|-----|------|
| **[PLAN.md](PLAN.md)** | Plan détaillé — inventaire, phases, gates, effets de bord |
| **[MATRIX-ACTUAL.md](MATRIX-ACTUAL.md)** | Matrice injection actuelle (gate G-spec) |
| **[frames-v0.yaml](frames-v0.yaml)** | Manifest frames v0 |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | Découpage Rust / TS · limite 500 L |
| **[INTEGRATION-internal-plan.md](INTEGRATION-internal-plan.md)** | **Plan L2** — fil d'Ariane moteur, transcript, phases B–E |
| **[PLAN-PROTO-FIXES.md](PLAN-PROTO-FIXES.md)** | **Phase F** — correctifs protocole · F4 tool folders · closure E ☑ |
| [SMOKE-ses_733093c6.md](../SMOKE-ses_733093c6.md) | Smoke run 1 (~3 min, folders OK) |
| [SMOKE-ses_733093c6-SESSION.md](../SMOKE-ses_733093c6-SESSION.md) | **Session complète** — échec multi-runs Qwen 3.6 27B |
| [CLOSURE-1.4.1.3.md](../finalisation/CLOSURE-1.4.1.3.md) | Clôture chantier |
| [PLAN-1.4.1.3](../PLAN-1.4.1.3.md) | Entrée plan depuis hub 1.4.1 |

---

## Relation aux autres versions

| Version | Lien |
|---------|------|
| **1.4.1** | Stabilisation rail / gates — base actuelle |
| **1.5.1** | UI chat — pas de conflit |
| **1.5.2** | Index / graphe / ContextPack — **complémentaire** (bloc injectable dans une frame boot READ) |

Ce chantier est **transversal** : il réorganise l’orchestration prompt + surface outil ; il ne remplace pas le rail ni l’intent probe.

---

## Règle de travail

```text
Spec + matrice + tests de non-régression documentés
  → revue / gate « pas d’effet de bord »
    → PR code minimale
      → smoke dogfood
```

**Statut** : **implémentation complète** (Phases 2–5) — smoke G-spec / G-folder en attente
