# Ambiguïtés — intégration moteur TUI dans l’UI Copilot (fork VS Code)

**Version** : 1.5.17  
**Accord** : on adapte l’**UI** au moteur TUI — pas l’inverse.  
**Usage** : liste à patcher **un par un**. Cocher / mettre à jour le statut après chaque correctif.  
**Fiches détail** : [amb/](amb/README.md) — une doc par AMB (modifications, acceptation). Créer / remplir la fiche **au moment du patch**.

Oui : l’intégration du moteur d’origine TUI dans le chassis chat Copilot a créé **plusieurs sources de vérité concurrentes**. Ce fichier les inventorie.

---

## Légende

| Champ | Sens |
|-------|------|
| **Sévérité** | P0 = contradiction forte modèle/user · P1 = écart sérieux · P2 = polish / dette |
| **Surface** | IDE / Rust / both |
| **Statut** | `ouvert` · `partiel` · `fait` |

---

## Synthèse rapide

| Sévérité | IDs |
|----------|-----|
| **P0** | AMB-01 (UI), AMB-05, AMB-08, AMB-16 |
| **P1** | AMB-01 (transcript), AMB-04, AMB-07, AMB-09 → AMB-15, AMB-17, AMB-18 |
| **P2** | AMB-02, AMB-03, AMB-06, AMB-11, AMB-19, AMB-20 |

**Déjà traité / partiel**

- AMB-01 : clear Agents + note system P1 — [fiche](amb/AMB-01-plan-trois-verites.md)
- AMB-08, 16, 12, 05, **09, 18, 03, 04** — **faits** (file 1.5.17) — [amb/](amb/README.md)
- Webview plan : déjà run-centric (`archivePlanIntoStrip`)
- Mapping modes RPC + OW wiring : présents ; labels modes alignés TUI (AMB-04)

**Reportés 1.5.18+** : AMB-02, 06–07, 10–11, 13–15, 17, 19–20 (dette / hors enveloppe) · connexions LLM hors AMB.

---

## AMB-01 — Plan : trois vérités (moteur / transcript / widget)

| | |
|--|--|
| **Sévérité** | P0 (UI) · P1 (transcript) |
| **Surface** | IDE |
| **Contrat TUI** | Plan = vie du `agent.run` ; gates reset au run suivant |
| **UI Copilot** | Widget session-sticky ; soft-clear si pas tout `completed` |
| **Ambiguïté** | Widget 5/6 + historique `todo_write` vs gates à zéro → modèle croit un plan vivant |
| **Statut** | **fait** — clear UI + note system one-shot |
| **Fiche** | [amb/AMB-01-plan-trois-verites.md](amb/AMB-01-plan-trois-verites.md) |
| **Patch suggéré** | (reste optionnel) snip transcript JSONL |

---

## AMB-02 — Soft-clear Copilot vs clear force Drox

| | |
|--|--|
| **Sévérité** | P2 |
| **Surface** | IDE |
| **Ambiguïté** | Chemins done / cancel / addRequest ne vident pas le plan de la même façon |
| **Statut** | reporté 1.5.18+ (politique soft-clear Copilot) |
| **Patch suggéré** | Documenter ; unifier uniquement les chemins Drox si régression |

---

## AMB-03 — `cancelled` → affiché `not-started` (Agents)

| | |
|--|--|
| **Sévérité** | P2 |
| **Surface** | IDE |
| **Ambiguïté** | Statut moteur `cancelled` mal mappé dans le widget natif |
| **Statut** | **fait** — titre ` · cancelled` (widget Copilot sans statut cancelled) |
| **Fiche** | [amb/AMB-03-cancelled-todo-mapping.md](amb/AMB-03-cancelled-todo-mapping.md) |
| **Patch suggéré** | Mapping sink `droxAgentsChatSink` |

---

## AMB-04 — Noms modes IDE ≠ vocabulaire TUI / prompts

| | |
|--|--|
| **Sévérité** | P1 |
| **Surface** | IDE (labels/docs) |
| **Contrat** | `analyze`→Plan, `trustEdit`→AcceptEdits, `imNotCrazy`→Default (RPC OK) |
| **Ambiguïté** | User lit « Planifier / Trust / I'm not crazy » ; docs TUI disent `--plan` / `--apply` / default |
| **Statut** | **fait** (descriptions + équivalent TUI `--plan` / `--apply` / default) |
| **Fiche** | [amb/AMB-04-vocabulaire-modes.md](amb/AMB-04-vocabulaire-modes.md) |
| **Patch suggéré** | Alignement labels / aide in-app sur le lexique moteur |

---

## AMB-05 — Défaut apply : TUI opt-in vs IDE opt-out

| | |
|--|--|
| **Sévérité** | P0 |
| **Surface** | both (clarifier produit) |
| **Contrat TUI** | `--apply` off → propose |
| **IDE** | `applyEdits: true` sauf `analyze` |
| **Ambiguïté** | Même `file_write` = propose (TUI) vs écriture (IDE Trust) — dogfood trompeur |
| **Statut** | **fait** (labels apply/propose ; wire inchangé) |
| **Fiche** | [amb/AMB-05-defaut-apply.md](amb/AMB-05-defaut-apply.md) |
| **Patch suggéré** | Afficher clairement apply/propose ; éventuellement aligner défauts produit |

---

## AMB-06 — Modes professor / bypass encore au moteur, absents UI

| | |
|--|--|
| **Sévérité** | P2 |
| **Surface** | both |
| **Ambiguïté** | Settings hérités peuvent activer des modes non exposés dans les vignettes |
| **Statut** | reporté 1.5.18+ — **hors file 1.5.17** (UI déjà retirée ; cleanup Rust = chantier séparé) |
| **Patch suggéré** | Masquer / migrer settings orphelins ; suppression Rust professor = optionnel / lourd |

---

## AMB-07 — Tools locaux Rust vs `RemoteTool` / `tool/exec`

| | |
|--|--|
| **Sévérité** | P1 |
| **Surface** | both |
| **Ambiguïté** | Même nom d’outil, exécution/path/confirm différents TUI vs IDE |
| **Statut** | reporté 1.5.18+ (archi assumée) |
| **Patch suggéré** | Parité messages d’erreur / sémantique ; doc écarts |

---

## AMB-08 — Propose / cancel = soft success (`isError: false`)

| | |
|--|--|
| **Sévérité** | P0 |
| **Surface** | both |
| **Ambiguïté** | Modèle reçoit un tool « OK » alors que rien n’est écrit → avance le plan / boucle |
| **Statut** | **fait** — cancel → `isError: true` |
| **Fiche** | [amb/AMB-08-propose-cancel-soft-success.md](amb/AMB-08-propose-cancel-soft-success.md) |
| **Patch suggéré** | `isError: true` sur cancel **ou** tool_result explicite « NOT applied » + nudge |

---

## AMB-09 — Phases TUI vs fold `thinking` Copilot (Agents)

| | |
|--|--|
| **Sévérité** | P1 |
| **Surface** | IDE |
| **Ambiguïté** | Agents cache beaucoup en « thinking » ; webview montre les phases — parité UX cassée |
| **Statut** | **fait** — helper `droxPhaseRoute` + sets webview alignés |
| **Fiche** | [amb/AMB-09-phases-thinking-fold.md](amb/AMB-09-phases-thinking-fold.md) |
| **Décision** | **Garder** le visuel Copilot (fold thinking) ; harmoniser le routage, pas le chrome |
| **Patch suggéré** | Harmoniser routage phase → UI entre Agents et webview |

---

## AMB-10 — Stream deltas vs `user_facing_reply` canonique

| | |
|--|--|
| **Sévérité** | P1 |
| **Surface** | IDE |
| **Ambiguïté** | Heuristique peut ignorer le résumé moteur → UI ≠ transcript |
| **Statut** | reporté 1.5.18+ (volontaire anti-trunc) |
| **Patch suggéré** | Critères plus stricts / log quand on ignore le canonique |

---

## AMB-11 — Native thinking Ollama vs `[phase: reasoning]`

| | |
|--|--|
| **Sévérité** | P2 |
| **Surface** | both |
| **Ambiguïté** | Deux canaux « réflexion » possibles |
| **Statut** | reporté 1.5.18+ |
| **Patch suggéré** | Doc + UI unique |

---

## AMB-12 — Gates / LoopDetected vs recovery UI asymétrique

| | |
|--|--|
| **Sévérité** | P1 |
| **Surface** | IDE |
| **Ambiguïté** | Webview : hint « loop detected » + recovery ; Agents : erreur brute + Retry — pas la même lecture user |
| **Exemple** | `chat.txt` → abort `both` (LD) ; UX Agents peu explicative |
| **Statut** | **fait** — rewrite loop Agents + helper partagé |
| **Fiche** | [amb/AMB-12-loop-recovery-asymetrique.md](amb/AMB-12-loop-recovery-asymetrique.md) |
| **Patch suggéré** | Parité messages / boutons recovery Agents ↔ webview |

---

## AMB-13 — Triple id session (`ses_*` / URI chat / fenêtre)

| | |
|--|--|
| **Sévérité** | P1 |
| **Surface** | IDE |
| **Ambiguïté** | Même transcript moteur, états UI (todos, busy, ask) pas partagés entre surfaces |
| **Statut** | reporté 1.5.18+ |
| **Patch suggéré** | Unifier état enveloppe ou documenter « surfaces isolées » |

---

## AMB-14 — `allowOutsideWorkspace` vs modes permission

| | |
|--|--|
| **Sévérité** | P1 |
| **Surface** | IDE |
| **Ambiguïté** | Toggle Sessions facilement confondu avec Trust edit ; wiring OK depuis 1.5.16 |
| **Statut** | reporté 1.5.18+ (wiring fait) |
| **Patch suggéré** | UX / copy plus clairs |

---

## AMB-15 — Transcript vs ui-replay vs widget

| | |
|--|--|
| **Sévérité** | P1 |
| **Surface** | IDE |
| **Ambiguïté** | Reopen session : replay UI peut diverger du JSONL ; modèle ne voit que le transcript |
| **Statut** | reporté 1.5.18+ |

| | |
|--|--|
| **Sévérité** | P0 |
| **Surface** | IDE |
| **Ambiguïté** | Empilement de dialogs ; deny/cancel soft (AMB-08) vs Ask « no » |
| **Statut** | **fait** — skip `confirmFileWrites` si Trust / I'm Not Crazy |
| **Fiche** | [amb/AMB-16-triple-confirmation.md](amb/AMB-16-triple-confirmation.md) |
| **Patch suggéré** | Une politique claire par mode ; réduire les doubles confirms |

---

## AMB-17 — Race `agent/done` stale vs ask pending

| | |
|--|--|
| **Sévérité** | P1 |
| **Surface** | IDE |
| **Ambiguïté** | Ask global / multi-run / Agents+webview |
| **Statut** | reporté 1.5.18+ (filtres runId déjà en place) |
| **Patch suggéré** | Ask scoped strictement par `runId` |

---

## AMB-18 — Dual surface Agents natif + webview legacy

| | |
|--|--|
| **Sévérité** | P1 (méta) |
| **Surface** | IDE |
| **Ambiguïté** | Un moteur, deux enveloppes → correctifs asymétriques (ex. plan clear Agents only) |
| **Statut** | **fait** (checklist + bilan file) |
| **Fiche** | [amb/AMB-18-dual-surface.md](amb/AMB-18-dual-surface.md) |
| **Patch suggéré** | Checklist « les deux surfaces » à chaque patch ; long terme : une enveloppe |

---

## AMB-19 — Soft-clear nouveau request pendant run Drox

| | |
|--|--|
| **Sévérité** | P2 |
| **Surface** | IDE |
| **Ambiguïté** | Risque faible si seul agent Drox |
| **Statut** | reporté 1.5.18+ |

---

## AMB-20 — Params orchestration IDE ignorés par le moteur

| | |
|--|--|
| **Sévérité** | P2 |
| **Surface** | IDE |
| **Ambiguïté** | UI laisse croire multi-agent ; Rust log ignore |
| **Statut** | reporté 1.5.18+ |
| **Patch suggéré** | Masquer contrôles orphelins |

---

## Ordre de patch recommandé (après AMB-01 UI)

```text
1. AMB-08  soft-success propose/cancel     ✓
2. AMB-16  confirms empilés                ✓
3. AMB-12  parité loop/recovery Agents     ✓
4. AMB-05  clarté apply vs propose         ✓ (labels)
5. AMB-01  P1 transcript / note system     ✓
6. AMB-09 / AMB-18  parité surfaces        ✓
7. AMB-03 / AMB-04  polish file            ✓
8. reste P1/P2 → reportés 1.5.18+
```

Workflow : patch code → remplir fiche [amb/AMB-XX-….md](amb/README.md) → statut ici → checklist dual surface (AMB-18).

**Suite produit hors AMB** : [PLAN-LLM-CONNECTIONS.md](PLAN-LLM-CONNECTIONS.md).

---

## Références

- [PLAN-1.5.17.md](PLAN-1.5.17.md) · [amb/](amb/README.md)
- Analyse `chat.txt` (abort LD `both` — clôture / todos, pas intent_only)
- Contrat TUI : `drox-tui` · moteur : `agent.rs` · Agents : `droxAgentsChatSink.ts`
