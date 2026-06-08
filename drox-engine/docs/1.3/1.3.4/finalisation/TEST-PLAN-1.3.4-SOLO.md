# Plan de test — clôture 1.3.4 (architecte seul)

**But** : valider le moteur en chemin produit **solo** (`executor_delegation_enabled: false`) — sans scénarios `delegate_executor` obligatoires.

**Héritage** : dérivé de [TEST-PLAN-1.3.2.md](../../1.3.2/finalisation/TEST-PLAN-1.3.2.md) — sections delegate / exécuteur **retirées ou adaptées**.

**Quand** : après rebuild binaire + Reload Window (voir prérequis).

---

## Prérequis binaire

```powershell
cd drox-engine\drox
cargo build -p drox-cli
# Reload Window IDE
# drox.executablePath → target\debug\drox.exe
.\scripts\verify-drox-engine.ps1   # MODERN (role_split), gate chain: False
```

Dans **Output → Drox Engine** : `pipeline=role_split`, `executor_delegation_enabled: false` (ou équivalent log tuning).

**RPC** : `orchestrationMode: role_split`, pas de `subagentsNumCtx` booléen, `orchestrationMaxParallelExecutors: 1`.

---

## 1. Routage (pas de tours gate)

| # | Message | Mode UI permission | `architectInteractionMode` | Attendu |
|---|---------|-------------------|----------------------------|---------|
| **T1** | « Salut » | Auto (`imNotCrazy` défaut) | `auto` | Aucun step `GATE · probe` ; run `architect_discussion` ou reply-only ; réponse courte ; **idéalement aucun outil** |
| **T2** | « Salut » | — | `discussion` | Run `architect_discussion` ; pas de `todo_write` / `file_edit` |
| **T3** | « Ajoute un commentaire dans README » | `trustEdit` | `action` | Run `architect` edit ; `file_edit` ou `file_write` ; pas de `delegate_executor` dans le schéma |
| **T4** | « Tu en penses quoi de ce pattern ? » | — | `discussion` | Avis court ; pas de plan multi-tâches |

---

## 2. Tool gates (garde-fous — doivent rester)

| # | Scénario | Attendu |
|---|----------|---------|
| **T5** | `[phase: done]` avec todos `in_progress` | Refus clôture (gate todo stale) |
| **T6** | Salut en run edit (mauvais routage / modèle dérive) | Nudge no-work ou réponse sans exploration lourde ; pas de boucle infinie |
| **T7** | `workspace_map_note` avec `summary` > 200 car. | **Tool error** structuré — le run continue |
| **T8** | `file_read` sur chemin inexistant | **Tool error** — pas `RunOutcome::Errored` opaque |

**Retiré vs 1.3.2** : T5–T6 anciens (`delegate_executor` sans plan/map) — non applicables en solo.

---

## 3. Parcours edit complet (smoke produit)

| # | Scénario | Attendu |
|---|----------|---------|
| **T9** | Tâche simple : lire un fichier + patch | `file_read` → `file_edit` ; diff appliqué ; réponse `[phase: answering]` |
| **T10** | Smoke test : `bash` (`cargo test` ou `npm test` selon repo) | Sortie tool dans résultat ; run se termine ; pas d'arrêt silencieux |
| **T11** | Cycle sanity solo | Todos `completed` → nudge sanity → **`bash`** (pas `delegate_executor`) → `[phase: done]` accepté si smoke OK |

---

## 4. Modes permission × moteur

| # | Mode vignette | Scénario | Attendu |
|---|---------------|----------|---------|
| **T12** | `analyze` | `file_write` hors `.drox/` | Refus permission moteur — message explicite |
| **T13** | `analyze` | `file_write` sous `.drox/` | Autorisé |
| **T14** | `trustEdit` | `file_edit` + `bash` | Pas de dialogue permission ; écritures appliquées |
| **T15** | `imNotCrazy` | `file_edit` | Dialogue ou `user/ask` permission ; run continue après choix |

---

## 5. Régression build & RPC

```powershell
cd drox-engine\drox
cargo test -p drox-engine
cargo test -p drox-cli
cargo build -p drox-cli
```

```powershell
# Depuis la racine repo (après compile out/)
npm run test-node -- --run "vs/workbench/contrib/drox/test/common/"
```

Vérifier qu'un `agent.run` avec `mode: trustEdit` ne sérialise **aucun** booléen là où le moteur attend un entier (`subagentsNumCtx`, etc.).

---

## 6. Presets moteur

Procédure : [VALIDATION-PRESETS-ENGINE-1.3.2.md](../../1.3.2/finalisation/VALIDATION-PRESETS-ENGINE-1.3.2.md) — **P8–P10** minimum.

| # | Résumé | OK ? |
|---|--------|------|
| **P8** | Preset **normal** — « Salut » fiable | ☐ |
| **P9** | Preset **relaxed** — message léger sans boucle | ☐ |
| **P10** | Preset **strict** — pas de régression extrême sur salut | ☐ |

En solo : les champs tuning « delegate » restent dans le schéma mais **nudges delegate ignorés** — pas de test delegate obligatoire.

---

## 7. Export chat (sanity UI)

Exporter le journal UI après T1–T3 :

- Pas de lignes `Step N — GATE ·`
- Rôles : `architect_discussion` ou `architect` uniquement (pas `executor`)
- Pas d'appel `delegate_executor` dans le transcript du run solo
- Bulle finale = texte réponse (hors thinking)

---

## 8. Dogfood (sessions réelles)

| # | Critère | OK ? |
|---|---------|------|
| **D1** | 2–3 sessions sur vrais workspaces sans retour au mode exécuteurs | ☐ |
| **D2** | Aucun `agent.run failed` silencieux (erreur visible dans le chat) | ☐ |
| **D3** | [chat.txt](../../chat.txt) — problèmes connus documentés si non résolus | ☐ |

---

## Critère « moteur 1.3.4 OK »

- [ ] T1–T4 passent sur binaire `target/debug/drox.exe` fraîchement buildé
- [ ] T5–T8 : gates / erreurs tool sans crash run
- [ ] T9–T11 : parcours edit + bash + sanity solo
- [ ] T12–T15 : modes permission cohérents
- [ ] Section 5 (tests auto) + section 6 (P8–P10) passées
- [ ] Section 8 (dogfood D1–D2) passée
- [ ] [CLOSURE-1.3.4.md](CLOSURE-1.3.4.md) signée

---

## Liens

- [PLAN-1.3.4.md](../PLAN-1.3.4.md)
- [RELIQUATS-ARCHITECTE-SEUL.md](../RELIQUATS-ARCHITECTE-SEUL.md)
- [TEST-PLAN 1.3.2 (référence)](../../1.3.2/finalisation/TEST-PLAN-1.3.2.md)
