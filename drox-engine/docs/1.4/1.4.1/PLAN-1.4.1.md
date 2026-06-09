# Plan 1.4.1 — Stabilisation dogfood

**Version** : juin 2026  
**Prérequis** : [1.4.0](../1.4.0/README.md) **clôturée** (moteur rail validé — B-RAIL-01 résolu)  
**Parent backlog** : [SMOKE-BACKLOG](../1.4.0/SMOKE-BACKLOG.md)  
**Hors scope** : polish UI chat → [1.4.2](../1.4.2/README.md) · index/graphe → [1.4.3](../1.4.3/PLAN-1.4.3.md)

> **Note** : l’ancien plan « index & graphe » vit désormais en [PLAN-1.4.3.md](../1.4.3/PLAN-1.4.3.md).

---

## Vision

Corriger les **bugs moteur et session** observés au smoke juin 2026, sans refonte du fil chat. L’utilisateur doit pouvoir enchaîner des runs fiables après la 1.4.0 ; l’UI visuelle attend la 1.4.2.

```text
1.4.0 rail OK
    → 1.4.1 discuss + boucles + session + busy
        → 1.4.2 UI chat
            → 1.4.3 index/graphe
```

---

## S1 — Discuss & routage léger (M-DISC-01)

**Problème** : « Salut » → `architect_discussion` mais `file_read` + `memory_list` malgré règle greeting-only (transcript `ses_5f0a049a`).

| Tâche | Fichier / zone |
|-------|----------------|
| Pre-gate discuss : 0 outil si `DiscussReplyOnly` + message light | `start_run.rs`, `architect_gates.rs` |
| Rejeter tools post-hoc si greeting-only détecté | `gates.rs` ou `loop.rs` |
| Test `cargo test` scénario salut | `orchestration/start_run.rs` tests |

**Critère** : R1 discuss — 0 outil, 1 tour LLM, `[phase: done]` ; export < 50 events UI.

---

## S2 — Fin de run & état busy (B-UI-07)

**Problème** : modèle terminé mais UI `busy` ; events perdus au blur app ; messages user triplés.

| Tâche | Fichier |
|-------|---------|
| Garantir `busy: false` sur Stop / erreur / cancel | `droxChatAgentEvents.ts`, `droxChatSendRun.ts` |
| Réconcilier runId au retour focus (heartbeat ou poll état moteur) | `droxChatAgentHost.ts` |
| Éviter double envoi user pendant busy stale | webview router / composer |

**Critère** : run charte terminé → bouton stop désactivé < 2 s même après alt-tab ; pas de message user dupliqué.

---

## S3 — Session replay performant (B-UI-06 — couche moteur/persistance)

**Problème** : réouverture app → replay 10k events UI, fil incorrect.

| Tâche | Fichier |
|-------|---------|
| Compaction journal : fusion `delta` consécutifs à l’écriture | `droxUiReplayJournal.ts`, session persist |
| Option cold-start : transcript moteur d’abord, UI lazy | `droxChatTabsManager.ts` |
| Snapshot compact par tour (option v1.1) | `.drox/sessions/` format |

**Critère** : session 5k events → chargement perçu < 2 s ; contenu cohérent (affichage fin → 1.4.2).

---

## S4 — Boucles & clôture run (B-MOTOR-01, B-MOTOR-03)

**Problème** : préambules thinking répétés ; double `[phase: answering]` ; loop intervention tardive.

| Tâche | Fichier |
|-------|---------|
| Réduire réinjection snapshot redondante mid-run | `architect_state.rs`, `run_snapshot` |
| `FinalAnswerGuard` : pas de 2e promotion answering | `final_answer_guard.rs` |
| Fingerprint loop : ignorer préambules stables | `loop.rs`, `phases.rs` |

**Critère** : run charte < 80 steps moteur ; une seule réponse finale canonique.

---

## S5 — VERIFY Windows (B-MOTOR-02)

**Problème** : spirale bash (`head`, lint timeout, quoting `node -e`) sur Windows.

| Tâche | Fichier |
|-------|---------|
| Rappel OS Windows dans prompt VERIFY / sanity | `nudges/`, prompt verify |
| `cycle_sanity` : commandes PowerShell-compat en nudge | `cycle_sanity.rs` |
| (Optionnel) pre-check bash `head`/`tail` | `permissions` ou tool wrapper |

**Critère** : smoke VERIFY Next.js Windows ≤ 2 bash utiles.

---

## S6 — Bench modèles & doc (non-code)

| Livrable | Détail |
|----------|--------|
| Matrice modèles | Qwen 27b = dogfood D3 ; Gemma 26b = hors scope edit |
| Rejouer R16 | `runRailEnabled: false` sur relaxed/strict après 1.4.0 |
| Mettre à jour TEST-PLAN sign-off | [09-TEST-PLAN](../1.4.0/09-TEST-PLAN.md) |

---

## Ordre recommandé

```text
S1 discuss (rapide, haute valeur R1)
  → S2 busy (bloque usage quotidien)
  → S4 boucles (qualité runs longs)
  → S3 session replay (perf cold start)
  → S5 VERIFY Windows
  → S6 doc + regression
```

---

## Critère de clôture 1.4.1

- [ ] M-DISC-01 + B-UI-07 + B-MOTOR-01/02/03 fermés ou explicitement reportés en 1.4.2 avec justification
- [ ] B-UI-06 compaction livrée (affichage peut rester 1.4.2)
- [ ] `cargo test -p drox-engine` vert
- [ ] Smoke : salut + charte CSS rejoués sur qwen27b sans régression rail 1.4.0
- [ ] [SMOKE-BACKLOG](../1.4.0/SMOKE-BACKLOG.md) journal mis à jour

---

## Non-objectifs 1.4.1

- B-UI-01 à 05 (layout, plan sticky, ask_user markdown, ordre thinking)
- Index / graphe / fast path / onboarding (→ 1.4.3)
- Nouveau comportement rail (→ doit être en 1.4.0)

---

## Liens

- [README 1.4.1](README.md)
- [1.4.2 UI](../1.4.2/README.md)
- [1.4.3 index](../1.4.3/PLAN-1.4.3.md)
