# Smoke 1.5.1 — Parité fil discussion TUI

**Version** : juin 2026 — branche `1.5.1`  
**Statut** : **à exécuter** — remplacer `ses_<id>` après dogfood  
**Plan** : [PLAN-1.5.1.md](PLAN-1.5.1.md) · F5 + `drox-tui` côte à côte

---

## Objectif

Valider que Drox Chat affiche un run **dans le même ordre** que le TUI (`drox-tui`) :

1. Phases en fil chronologique (libellés FR courts).
2. Outils inline au moment de l’appel.
3. Réponse utilisateur **uniquement** sous phase `answering`.
4. Replay session à la réouverture (journal UI ou transcript fallback).
5. Wizard « Connecter son IA » fonctionnel (cloud ou perso).

---

## Préparation

| Étape | Action |
|-------|--------|
| Build IDE | `npm run watch` + F5 sur branche `1.5.1` |
| Moteur | `drox.exe` debug connecté via wizard (test liste modèles OK) |
| Workspace | `site-kdds` ou repo de dogfood habituel |
| TUI (optionnel) | `drox-tui` même workspace + même modèle pour comparaison visuelle |

---

## Scénarios (3 tours)

| Run | Message utilisateur | Attendu fil IDE |
|-----|---------------------|-----------------|
| **1** | « Salut ! » | Short phases → `── [Answering] ──` · reply bubble · no tools |
| **2** | « Tu peux analyser le répertoire de code ? » | `Analyzing` / `Reading` · inline `file_read` / `grep` · reply under `Answering` |
| **3** | Brief mutation fichier (ex. background animé) | `Action` · `file_edit` ou `file_write` · réponse finale visible |

---

## Critères d’acceptation

| ID | Critère | OK ? | Preuve |
|----|---------|------|--------|
| **TUI-1** | Ordre phases + outils identique TUI vs F5 (tolérance CSS) | ☐ | capture / export |
| **TUI-2** | Phase markers in **English** (`Reading`, `Answering`, …) | ☐ | |
| **TUI-3** | Travail interne repliable · réponse seule sous `answering` | ☐ | |
| **TUI-4** | Stop run → composer `Ready` · plus d’activité stale | ☐ | |
| **TUI-5** | Fermer IDE → rouvrir session → fil lisible (replay S1) | ☐ | |
| **TUI-6** | `ask_user` : prompt markdown + carte bornée en hauteur | ☐ | |
| **TUI-7** | Connexion IA via wizard 3 étapes · run agent OK | ☐ | |
| **TUI-8** | `droxVersion` affiché **1.5.1** | ☐ | |

---

## Métriques à noter

```text
Session: ses_____________________
Build IDE: _______________________
droxVersion: ____________________
Moteur: _________________________
Tours: ___ / 3 validés
Replay: journal UI ☐  transcript fallback ☐
```

---

## Verdict

| Verdict | Condition |
|---------|-----------|
| **VERT** | TUI-1…TUI-8 OK |
| **ORANGE** | Fil OK mais replay legacy incohérent sur vieille session |
| **ROUGE** | Ordre fil ≠ TUI ou réponse hors phase `answering` |

---

## Export post-smoke

Après dogfood, copier l’export dans `docs/chat_<workspace>/` et renommer ce fichier en `SMOKE-1.5.1-ses_<id>.md` avec verdict rempli.
