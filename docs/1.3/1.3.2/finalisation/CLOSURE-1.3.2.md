# Clôture 1.3.2 — moteur stabilisé (sans bruit)

**Date cible** : juin 2026  
**Version** : `droxVersion` **1.3.2**  
**Statut** : **livré (code)** — mergé sur `main` juin 2026. Binaire OR 1.3.2 = bundle obsolète ; correctif pipeline + repackage en **1.3.3**.

---

## Périmètre **inclus** (ce qu’on livre)

| # | Livrable | Statut code |
|---|----------|-------------|
| **S1** | **Moteur simplifié** : plus de `GateEngine`, `EditTier`, backpack, `architect_intent` | ✅ |
| **S2** | Routage **RPC** discuss / analyze / edit (défaut edit) | ✅ |
| **S3** | Prompt edit : `01_core` + protocoles `T-*` au boot + `parallel_slots` | ✅ |
| **S4** | Tool gates durs (`architect_gates`, `gates.rs`) — inchangés volontairement | ✅ |
| **S5** | Nettoyage reliquats (events gate, `context_bubble`, registry `E-*`, UI `gateDev`) | ✅ |
| **S6** | **Tests** — [TEST-PLAN-1.3.2.md](TEST-PLAN-1.3.2.md) | 🔄 reporté 1.3.4 |
| **S7** | **Presets moteur** — [VALIDATION-PRESETS-ENGINE-1.3.2.md](VALIDATION-PRESETS-ENGINE-1.3.2.md) | 🔄 reporté 1.3.4 |
| **S8** | **Dette webview chat** — 4 points acceptés (état global, host router, DOM, scripts) — [DETTES-WEBVIEW-1.3.2.md](DETTES-WEBVIEW-1.3.2.md) | ✅ doc |
| **S9** | **Délégation paramétrique** — nudges `max_reads_before_delegate` + `max_mutations_before_delegate_nudge` branchés ; presets strict = petits modèles | ✅ code |
| **S10** | **Pré-release active** — L2 lazy · D1–D2 débrand/legal — [PRE-RELEASE-ACTIF-1.3.2.md](PRE-RELEASE-ACTIF-1.3.2.md) | ✅ code |

**Référence code** : [CONDUCTEUR-CODE.md](../CONDUCTEUR-CODE.md)

---

## Périmètre **exclu** — reporté ou annulé

Tout ce qui traînait dans les plans 1.3.2 initiaux **ne fait plus partie** de cette release :

| Ancien axe | Décision | Où ça va |
|------------|----------|----------|
| Gate chain TOML (`entry` → `discuss.*`) | **Annulé** | Archive [gates/ARCHIVE.md](../gates/ARCHIVE.md) |
| Paliers `E-*` / injection palier dans loop | **Annulé** | — |
| Backpack / RAG fiches | **Annulé** | Remplacé par vision 1.4.1 (index local) |
| Prompts additifs phases 1–2 (snapshot par palier) | **Annulé** | Snapshot factuel complet conservé |
| Sessions segmentées (pilier 2) | **Reporté** | 1.3.3+ ou IDE hors moteur |
| Dé-branding + licences (pilier 3) | **Reporté** | 1.3.1 / release produit |
| Télémétrie / perf globale | **Reporté** | 1.3.3+ |
| Retrait UI Exploring | **Reporté** | IDE — hors blocage moteur |

**Les 3 piliers produit** (index intelligent, graphe contexte, fast path / latence) → **[1.4.1](../../1.4/1.4.1/README.md)**. Release fiable → **[1.3.3](../1.3.3/README.md)**.

---

## Checklist avant tag `v1.3.2`

### Moteur

- [ ] [TEST-PLAN-1.3.2.md](TEST-PLAN-1.3.2.md) exécuté (T1–T10 + section presets P8–P10)
- [ ] [VALIDATION-PRESETS-ENGINE-1.3.2.md](VALIDATION-PRESETS-ENGINE-1.3.2.md) — pertinence réglages utilisateur validée
- [ ] `cargo test -p drox-engine` vert
- [ ] IDE pointe `target/debug/drox.exe` rebuild + Reload Window

### Release (si publish)

- [ ] `package.json` → `droxVersion` **1.3.2**
- [ ] `npm run drox:ship` + smoke install
- [ ] [PATCHNOTES-1.3.2.md](../PATCHNOTES-1.3.2.md) à jour

---

## Critère « 1.3.2 livrée »

- [ ] Moteur **stable et testé** selon TEST-PLAN (pas de gate chain dans l’export)
- [ ] Doc alignée : CONDUCTEUR-CODE + ARCHIVE gates
- [ ] [PRE-RELEASE-ACTIF-1.3.2.md](PRE-RELEASE-ACTIF-1.3.2.md) — R1 session lazy + R3 agents off + R4 débrand
- [ ] Aucun chantier ouvert **bloquant** listé en S6

---

## Journal

| Date | Événement |
|------|-----------|
| 2026-06-02 | Périmètre initial 4 axes (gate, sessions, dé-brand, bugs) |
| 2026-06-06 | **Recentrage** : 1.3.2 = simplification moteur + tests ; reste → 1.3.3 |
| 2026-06-06 | Suppression GateEngine, EditTier, backpack, reliquats code/UI |
| 2026-06-07 | Dette webview S8 documentée ; nudges délégation paramétriques S9 ; dogfood site-kdds OK ([chat.txt](../chat.txt)) |
| 2026-06-07 | Merge `1.3.2` → `main` ; **1.3.3** (release fiable) · **1.3.4** (stabilisation) · **1.4.1** (piliers) |

---

## Liens

- [README 1.3.2](../README.md)
- [TEST-PLAN](TEST-PLAN-1.3.2.md)
- [1.3.3](../1.3.3/README.md) · [1.3.4](../1.3.4/README.md) · [1.4.1](../../1.4/1.4.1/README.md)
