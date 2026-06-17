# Drox 1.4.1 — Stabilisation dogfood

**Statut** : **clôturée** (juin 2026) — fusionnée sur `main` · [CLOSURE](finalisation/CLOSURE-1.4.1.md)  
**Branche** : `1.4.1`  
**Prérequis** : [OPENING-1.4.1](finalisation/OPENING-1.4.1.md) · [README racine](../../../../README.md#statut-produit)

---

## En une phrase

Stabiliser le moteur et la session après la refonte rail **1.4.0** : surface prod (`droxSurface`), discuss (R1a/R1b dogfood qwen27b), busy, mutations ACT, boucles, VERIFY Windows, replay — **sans** polish UI chat (→ 1.4.2).

---

## Plans (ordre d’exécution)

```text
PLAN-1.4.1       base « 0 » — stabilisation dogfood (P1–P8)
  → PLAN-1.4.1.1   intent probes + English engine
    → PLAN-1.4.1.2a  context diet (réduire bruit injection)
      → PLAN-1.4.1.2   patch rail / clôture / VERIFY
        → PLAN-1.4.1.3   Context Frame · outils dossiers · plan interne
          → semver 1.4.1.x + 1.4.2 UI
```

| Plan | Focus | Statut (juin 2026) |
|------|-------|-------------------|
| [PLAN-1.4.1](PLAN-1.4.1.md) | Stabilisation dogfood P1–P8 | Partiel — P1–P5 livrés |
| [PLAN-1.4.1.1](PLAN-1.4.1.1.md) | Intent probe + anglais moteur | **Clôturé** — [CLOSURE](finalisation/CLOSURE-1.4.1.1.md) |
| [PLAN-1.4.1.2a](PLAN-1.4.1.2a.md) | Context diet (B-CTX-02) | **Code livré** — smoke reporté |
| [PLAN-1.4.1.2](PLAN-1.4.1.2.md) | Rail / clôture / outils | **Code clôturé** — [CLOSURE](finalisation/CLOSURE-1.4.1.2.md) · smokes **debunk** |
| [PLAN-1.4.1.3](PLAN-1.4.1.3.md) | Context Frame · dossiers outils · plan interne | **Phase 1–2 en cours** |
| [SMOKE-ses_2e0b2a5e](SMOKE-ses_2e0b2a5e.md) | Analyse dogfood Qwen 2.7B — **pré-patch** | **Documenté** |
| [SMOKE-ses_4b2c1d08](SMOKE-ses_4b2c1d08.md) | Re-smoke post-1.4.1.2 — **partiel vert** | **Documenté** |

→ **[PLAN-1.4.1.md](PLAN-1.4.1.md)** — contexte post-1.4.0 + **[tableau d’exécution § XIV](PLAN-1.4.1.md#xiv--tableau-dexécution-ordonné)** (phases 0→8)

L’ancien plan **index / graphe** est en **[1.4.3](../1.4.3/PLAN-1.4.3.md)**.

---

## Périmètre (backlog smoke)

| ID | Sujet | Phase |
|----|-------|-------|
| **B-REL-01** | `droxSurface` + features dev ; version prod sans suffixe | P1 |
| **B-DISC-02** | Extracteur `[discussion: reply]` (marqueurs inline thinking) | P2 |
| **M-DISC-01** | Salut discuss → routage `reply_only` + pre-gate outils | P2 |
| **B-DISC-03** | Fallback `userFacingReply` sans marqueurs | P2 |
| **B-UI-07** | Run `busy` stale | P3 |
| **B-MOTOR-04** | Edit sans `file_edit` / clôture sans mutation | P4 |
| **B-MOTOR-01** | Préambules thinking en boucle | P4 |
| **B-MOTOR-03** | Double answering | P4 |
| **B-MOTOR-02** | Bash VERIFY Windows | P5 |
| **B-UI-06** | Replay session lent | P6 |
| **G-DEBT-01** | Split `loop/drive/tools.rs` (> 500 L) | P7 |

**Refonte [1.4.1.1](PLAN-1.4.1.1.md)** : B-INTENT-01…07, B-I18N-01…04 (probes + anglais moteur)

**Context [1.4.1.2a](PLAN-1.4.1.2a.md)** : B-CTX-02a…e (context diet — **avant rail**)

**Patch rail [1.4.1.2](PLAN-1.4.1.2.md)** : B-RAIL-02, B-MOTOR-05…08, B-PROPOSE-01, B-CYCLE-01 (dogfood juin 2026 — **après 1.4.1.2a**)

**1.4.2** : B-UI-01 à 05 · **reporté** : B-RAIL-01 résidu (`[gate:]` modèle)

Détail : [SMOKE-BACKLOG](../1.4.0/archive/SMOKE-BACKLOG.md)

---

## Ordre d’attaque

```text
P1 droxSurface → P2 discuss → P3 busy → P4 boucles/ACT
  → P5 VERIFY → P6 replay → P7 dette → P8 smoke + clôture
```

---

## Suite

- [1.4.2 — UI chat](../1.4.2/README.md)
- [1.4.3 — Index & graphe](../1.4.3/README.md)
- [Hub 1.4](../README.md)
