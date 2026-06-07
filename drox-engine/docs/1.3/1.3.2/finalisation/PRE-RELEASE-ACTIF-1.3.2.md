# Pré-release active — Drox IDE 1.3.2

**Objectif** : passer de « moteur stabilisé en dogfood » à une **release produit** utilisable en développement actif — sans promettre la 1.3.5 (index, graphe).

**Statut** : chantier ouvert — **bloquant tag `v1.3.2` stable**.

---

## Axes (ordre recommandé)

| # | Axe | Doc | Priorité |
|---|-----|-----|----------|
| **R1** | Chargement session **tail-first** (L1) | [PLAN-CHARGEMENT-SESSION-LAZY-1.3.2.md](PLAN-CHARGEMENT-SESSION-LAZY-1.3.2.md) | ✅ L1 · L2 ☐ |
| **R2** | Dette webview (exécution) | [DETTES-WEBVIEW-1.3.2.md](DETTES-WEBVIEW-1.3.2.md) · [CHANTIER-WEBVIEW-1.3.2.md](CHANTIER-WEBVIEW-1.3.2.md) | P1 — W0 🔄 |
| **R3** | Désactiver écosystème **Agents VS Code** (D1) | [D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md](D1-DESACTIVATION-MICROSOFT-AGENTS-1.3.2.md) | ✅ D1 |
| **R4** | Dé-branding + licences (suite) | [ETAT-LIEUX-DEBRAND-LICENCES-1.3.2.md](ETAT-LIEUX-DEBRAND-LICENCES-1.3.2.md) | 🔄 D1 fait · welcome ☐ |
| **R5** | Tests + presets (existant) | [TEST-PLAN-1.3.2.md](TEST-PLAN-1.3.2.md) · [VALIDATION-PRESETS-ENGINE-1.3.2.md](VALIDATION-PRESETS-ENGINE-1.3.2.md) | P1 |

---

## Critère « release dev active »

- [ ] Réouverture app : **1 tour visible** par défaut, historique chargeable au scroll (R1)
- [ ] Pas de bouton **Open in Agents** / fenêtre Agents accessible par erreur (R3)
- [ ] Premier lancement : pas de funnel Copilot / aka.ms (R4 F.A–F.B)
- [ ] Package : `LICENSE.txt` + `ThirdPartyNotices.txt` + `NOTICE-DROX` à jour (R4)
- [ ] Moteur : TEST-PLAN T1–T10 + presets P8–P13 verts
- [ ] `droxVersion` **1.3.2** + smoke `drox:ship`

---

## Hors périmètre 1.3.2 stable

- Virtualisation complète timeline (R2 #3 — après tail-first)
- Bundle webview unique (R2 #4 — phase 2)
- Marketplace Open VSX / retrait extensions Microsoft embarquées
- Agents Window KDDS (brainstorm #13) — produit séparé

---

## Liens

- [CLOSURE-1.3.2.md](CLOSURE-1.3.2.md)
- [PLAN-DEBRAND-MICROSOFT.md](../../1.3.1/finalisation/PLAN-DEBRAND-MICROSOFT.md) (héritage 1.3.1)
- [RULES.md](../../../../RULES.md) §2
