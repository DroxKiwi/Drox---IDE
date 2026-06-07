# Journal 1.3.2 — ce qu’on a fait

Document vivant : une entrée par livrable (date, statut, liens).

**Vue d’ensemble** : [README.md](README.md) · **Clôture** : [finalisation/CLOSURE-1.3.2.md](finalisation/CLOSURE-1.3.2.md) · **Tests** : [TEST-PLAN-1.3.2.md](finalisation/TEST-PLAN-1.3.2.md)

---

## Légende

| Statut | Signification |
|--------|----------------|
| ✅ | Livré |
| 🔄 | En cours |
| ☐ | Prévu |

---

## Entrées

### 2026-06-07 — L1 complet + D1 agents Microsoft off

| | |
|---|---|
| **Statut** | ✅ L1 + D1 |
| **L1** | `DROX_CHAT_TAB_LOAD_TAIL` partout ; restore 1 tour |
| **D1** | `droxMicrosoftAgentsSurfaceEnabled: false` ; [D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md](finalisation/D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md) + backup `assets/product-defaultChatAgent.microsoft-backup.json` |
| **Réactiver Agents MS** | `product.json` flag `true` + restaurer backup — **pas pour utilisateur final** |

---

### 2026-06-07 — Pré-release active + chantier webview W0

| | |
|---|---|
| **Statut** | 🔄 doc + code démarré |
| **But** | Préparer release dev : session lazy, débrand, agents VS Code off ; attaquer dette webview |
| **Livré** | [PRE-RELEASE-ACTIF-1.3.2.md](finalisation/PRE-RELEASE-ACTIF-1.3.2.md) + plans R1/R3/R4 ; [CHANTIER-WEBVIEW](finalisation/CHANTIER-WEBVIEW-1.3.2.md) W0 |
| **Code** | `droxChatHostMessageKinds.ts` + test parité ; `droxProductDefaultsConfiguration.ts` (`chat.agent.enabled` défaut false) |
| **Suite** | L1 tail-first session · D1 débrand product.json · welcome off |

---

### 2026-06-07 — Dogfood site-kdds + dette webview + délégation paramétrique

| | |
|---|---|
| **Statut** | ✅ code + doc |
| **But** | Clôturer dette webview en 1.3.2 ; brancher nudges délégation sur presets ; confirmer flux edit sans sub-agent sur petit fix |
| **Test** | Session `ses_7f5d7903` ([chat.txt](chat.txt)) — Salut OK ; suppression faisceau lumière `home-content.tsx` en direct (`file_edit` + bash + lsp), sans `delegate_executor` — **comportement attendu** pour fix unitaire |
| **Livré** | [DETTES-WEBVIEW-1.3.2.md](finalisation/DETTES-WEBVIEW-1.3.2.md) ; `architect_delegate_cap_nudge` + `max_mutations_before_delegate_nudge` ; presets strict reads=6 / mutations=1 |
| **Note** | Petits modèles → preset **strict** pour nudges délégation plus tôt ; délégation reste optionnelle (`01_core`, nudges soft) |

---

### 2026-06-07 — Fiabilité : presets moteur + doc validation

| | |
|---|---|
| **Statut** | 🔄 doc · ☐ dogfood |
| **But** | Vérifier pertinence des paramètres utilisateur (`EngineTuning`, presets) après refacto architecte libre |
| **Livré** | [VALIDATION-PRESETS-ENGINE-1.3.2.md](finalisation/VALIDATION-PRESETS-ENGINE-1.3.2.md) ; §6 TEST-PLAN ; S7 CLOSURE |
| **Reste** | Cocher P8–P10 + P1–P7 pendant tests fiabilité |

---

### 2026-06-06 — Recentrage périmètre + alignement doc

| | |
|---|---|
| **Statut** | ✅ doc · ☐ tests |
| **But** | 1.3.2 = **stabilisation** sans bruit ; tout le reste → 1.3.3 |
| **Livré** | README, PATCHNOTES, CLOSURE, hub 1.3 ; création **1.3.3** (3 piliers) ; bannières docs obsolètes |
| **Fichiers** | `docs/1.3/1.3.2/**`, `docs/1.3/1.3.3/**`, `docs/1.3/README.md` |

---

### 2026-06-06 — Simplification moteur (gros chantier)

| | |
|---|---|
| **Statut** | ✅ code |
| **But** | Supprimer GateEngine, EditTier, backpack, architect_intent, reliquats UI/events |
| **Livré** | Routage RPC direct ; `01_core` réaligné ; tool gates conservés ; 237 tests `drox-engine` verts |
| **Référence** | [CONDUCTEUR-CODE.md](CONDUCTEUR-CODE.md) · [gates/ARCHIVE.md](gates/ARCHIVE.md) |

---

### 2026-06-02 — Executor « Same as Architect » (UI + run)

| | |
|---|---|
| **Statut** | ✅ |
| **But** | Même modèle et paramètres LLM que l’architecte ; seul **Concurrent** côté exécuteur. |
| **Fichiers** | `01c-role-models.js`, `droxChatRoleModels.ts`, `droxRunSettings.ts`, `agent_run.rs` |

---

### 2026-06-02 — Journal & doc initiale

| | |
|---|---|
| **Statut** | ✅ (remplacé par recentrage 2026-06-06) |
| **Fichiers** | `JOURNAL-1.3.2.md`, `PATCHNOTES-1.3.2.md`, `CLOSURE-1.3.2.md` |

---

## Périmètre actuel (post-recentrage)

| # | Axe | Statut | Référence |
|---|-----|--------|-----------|
| **S1** | Moteur simplifié | ✅ | CONDUCTEUR-CODE |
| **S2** | Tests dogfood T1–T10 + presets P8–P10 | ☐ | TEST-PLAN · VALIDATION-PRESETS |
| **S3** | Tag / release 1.3.2 | ☐ | CLOSURE |

**1.3.3** (index, graphe, fast path) : [../1.3.3/PLAN-1.3.3.md](../1.3.3/PLAN-1.3.3.md)

---

## Docs historiques (ne plus suivre)

Plans gates, backpack, paliers `E-*`, circuit gate chain → [gates/ARCHIVE.md](gates/ARCHIVE.md)
