# Plan de test — clôture 1.3.2 (moteur stabilisé)

**But** : valider le moteur **sans** gate chain, **sans** paliers, **sans** backpack — avant tag `v1.3.2`.

**Prérequis binaire** :

```powershell
cd drox-engine\drox
cargo build -p drox-cli
# Reload Window IDE
# drox.executablePath → target\debug\drox.exe
.\scripts\verify-drox-engine.ps1   # doit afficher MODERN (role_split), gate chain: False
```

Dans **Output → Drox Engine** : `pipeline=role_split` (plus `role_split+gate_toml`).

---

## 1. Routage (pas de tours gate)

| # | Message | Mode UI | Attendu |
|---|---------|---------|---------|
| T1 | « Salut » | Auto | **Aucun** step `GATE · probe`, **aucun** `architect_intent` ; discuss ou edit direct ; réponse courte **sans** outils |
| T2 | « Salut » | Discussion | Run `architect_discussion` ; pas de `todo_write` / `delegate_executor` |
| T3 | « Ajoute un bouton dans X » | Action / Edit | Run `architect` ; workflow map → plan → delegate possible |
| T4 | « Tu en penses quoi de Y ? » | Discussion | Avis court ; pas de plan multi-tâches |

---

## 2. Tool gates (garde-fous — doivent rester)

| # | Scénario | Attendu |
|---|----------|---------|
| T5 | `delegate_executor` sans `todo_write` avant | Blocage avec nudge plan |
| T6 | `delegate_executor` sans `workspace_map_read` (si tuning actif) | Blocage map |
| T7 | `[phase: done]` avec todos `in_progress` | Refus clôture |
| T8 | Salut en run edit (mauvais gate) | Pas d’outils ; `[phase: answering]` + `[phase: done]` |

---

## 3. Sub-agents

| # | Scénario | Attendu |
|---|----------|---------|
| T9 | Tâche simple avec delegate | Livrable `.drox/agent-output/.../*.md` ; architecte verify |
| T10 | Scope trop large | Blocage + message split scope (pas « mission impossible ») |

---

## 4. Régression build

```powershell
cargo test -p drox-engine
cargo build -p drox-cli
```

---

## 5. Export chat (sanity)

Exporter le journal UI après T1–T3 :

- Pas de lignes `Step N — GATE ·`
- Rôles visibles : `architect_discussion` ou `architect` uniquement
- Bulle finale = texte réponse uniquement (pas de thinking / fragments `userFacingReply`)

---

## 6. Presets & paramètres moteur (post-refacto)

Après le recentrage « simplifier + fiabiliser », valider que les réglages utilisateur (`drox.engine.strictness`, `drox.engine.tuning.*`, panneau ⚙) restent **pertinents** et alignés sur le comportement réel (nudges vs anciens blocages workflow).

**Procédure détaillée** : [VALIDATION-PRESETS-ENGINE-1.3.2.md](VALIDATION-PRESETS-ENGINE-1.3.2.md)

| # | Résumé | OK ? |
|---|--------|------|
| P8 | Preset **normal** — « Salut » fiable | ☐ |
| P9 | Preset **relaxed** — message léger sans boucle | ☐ |
| P10 | Preset **strict** — pas de régression extrême sur salut | ☐ |
| P1–P7 | Descriptions IDE / pertinence champs custom | ☐ |

---

## Critère « moteur 1.3.2 OK »

- [ ] T1–T4 passent sur binaire `target/debug/drox.exe` fraîchement buildé
- [ ] T5–T7 : tool gates actifs (comportement attendu) — *réviser si gates assouplies*
- [ ] Section 6 (presets P8–P10 + pertinence P1–P7) passée
- [ ] Tests Rust verts
- [ ] Export sans gate chain
