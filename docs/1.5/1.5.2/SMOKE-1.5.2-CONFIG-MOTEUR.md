# Smoke 1.5.2 — Configuration moteur IDE (`agent.run`)

**Version** : juin 2026 — branche `1.5.2`  
**Statut** : **à exécuter** — remplacer `ses_<id>` après dogfood  
**Plan** : [PLAN-1.5.2.md](PLAN-1.5.2.md) · build **release** (`drox:ship`) recommandé

---

## Objectif

Valider que les réglages **Architecte** et **Général** modifient le prochain `agent.run` (wire RPC `tui_mono`), sans legacy 1.4.

---

## Préparation

| Étape | Action |
|-------|--------|
| Build | `npm run drox:ship` ou F5 surface `release` |
| Moteur | `drox.exe` connecté (wizard OK, liste modèles OK) |
| Workspace | repo de dogfood habituel |
| Ollama | Modèle chargé, logs RPC activables si besoin |

---

## Scénario principal (M1-7)

| # | Action UI | Attendu `agent.run` (prochain message) |
|---|-----------|----------------------------------------|
| 1 | Ouvrir panneau **Architecte** 🏛 | Champs sampling visibles en release |
| 2 | Régler **Top P** = `0.85` (ou valeur distinctive) | — |
| 3 | Régler **Max tokens** = `2048` | — |
| 4 | Régler **Keep alive** = `30m` | — |
| 5 | Ouvrir panneau **Général** ⚙ | Pas de sampling ici |
| 6 | Régler **Max iterations** = `37` | — |
| 7 | Envoyer un message court (« ping ») | Run démarre |
| 8 | Inspecter JSON RPC / trace moteur | `topP: 0.85`, `maxTokens: 2048`, `keepAlive: "30m"`, `maxIterations: 37` |
| 9 | Vérifier absence legacy | Pas de `orchestrationMode`, `architectInteractionMode`, `engineTuning` |

**Vider un champ** (ex. Top P) → la clé correspondante **absente** du JSON (pas `0` arbitraire).

---

## Settings VS Code (miroir)

| # | Action | Attendu |
|---|--------|---------|
| S1 | Ouvrir Settings → **Drox** | Pas d’entrée `engine.tuning.*` ni `interactionMode` |
| S2 | Modifier `drox.topP` / `drox.maxIterations` | Prochain run conforme (comme panneaux chat) |
| S3 | Ancienne clé `drox.numPredict` seule en settings | Repli lecture → `maxTokens` si `drox.maxTokens` vide |

---

## Critères d’acceptation

| ID | Critère | OK ? | Preuve |
|----|---------|------|--------|
| **CFG-1** | Sampling Architecte visible en build release | ☐ | capture |
| **CFG-2** | `topP` modifié → présent dans `agent.run` | ☐ | trace / log |
| **CFG-3** | `maxIterations` = 37 (ou valeur test) dans `agent.run` | ☐ | trace |
| **CFG-4** | `keepAlive` + `maxTokens` wire OK | ☐ | trace |
| **CFG-5** | Aucun champ orchestration 1.4 dans le JSON | ☐ | trace |
| **CFG-6** | Settings Drox sans `engine.tuning` / `interactionMode` | ☐ | capture |
| **CFG-7** | Défaut `max_iterations` = **50** (workspace neuf) | ☐ | Général / settings |
| **CFG-8** | `droxVersion` affiché **1.5.2** (au ship) | ☐ | header chat |

---

## Métriques à noter

```text
Session: ses_____________________
Build IDE: _______________________
droxSurface: release ☐  dev ☐
droxVersion: ____________________
Moteur pipeline: tui_mono ☐
topP envoyé: ____________________
maxIterations envoyé: ___________
maxTokens / keepAlive: __________
Legacy RPC absent: ☐
```

---

## Verdict

| Verdict | Condition |
|---------|-----------|
| **VERT** | CFG-1…CFG-7 OK (CFG-8 au tag ship) |
| **ORANGE** | Wire OK en dev mais release build non testée |
| **ROUGE** | Sampling ou max_iterations ignorés dans `agent.run` |

---

## Tests automatisés (CI locale)

```bash
npm run compile
node test/unit/node/index.js --run "out/vs/workbench/contrib/drox/test/common/droxRunSettings.test"
node test/unit/node/index.js --run "out/vs/workbench/contrib/drox/test/common/droxCommon.test"
```

Suite ciblée : `Drox — M1 config moteur (read + agent.run wire)`.

---

## Export post-smoke

Après dogfood, renommer ce fichier en `SMOKE-1.5.2-ses_<id>.md` avec verdict et extraits trace `agent.run`.
