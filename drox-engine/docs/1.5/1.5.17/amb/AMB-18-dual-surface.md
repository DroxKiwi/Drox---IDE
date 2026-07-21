# AMB-18 — Dual surface Agents natif + webview legacy

| | |
|--|--|
| **ID** | AMB-18 |
| **Sévérité** | P1 (méta) |
| **Surface** | IDE |
| **Statut** | `fait` (process) |
| **Inventaire** | [AMBIGUITIES-IDE-TUI.md](../AMBIGUITIES-IDE-TUI.md) |

---

## Problème

Un moteur, deux enveloppes → correctifs asymétriques (ex. plan clear Agents only en AMB-01 P0).

## Contrat TUI (cible)

Même contrat d’état run-centric quelle que soit la surface IDE.

## Décision produit

Court terme : **checklist « les deux surfaces »** à chaque patch AMB.  
Long terme : une enveloppe (hors scope 1.5.17 forcé).

---

## Checklist (à coller dans chaque fiche AMB à l’acceptation)

```text
[ ] Agents natif (sink / session handler / picker)
[ ] Webview legacy (host events / media JS) — ou « N/A webview » justifié
[ ] Helper partagé dans common/ si la règle est la même des deux côtés
[ ] Tests unitaires couvrent le chemin touché (ou smoke noté)
```

## Bilan file 1.5.17 (surfaces)

| AMB | Agents | Webview | Notes |
|-----|--------|---------|-------|
| 01 | ✓ | ✓ (déjà run-centric) | clear + note system |
| 05 | ✓ labels | ✓ labels | |
| 08 | ✓ tools host | ✓ (même tools) | |
| 09 | ✓ | ✓ | `droxPhaseRoute` |
| 12 | ✓ | ✓ helper | |
| 16 | ✓ | ✓ (confirm skip) | |

## Modifications

| Fichier | Symbole / zone | Changement |
|---------|----------------|------------|
| `amb/README.md` | file + checklist | Formalisé |
| cette fiche | bilan | Remplie |

### Tests

- [x] File prioritaire : chaque P0/P1 patché a touché les deux surfaces (ou N/A documenté)

### Hors scope / non touché

- Fusion complète des deux UIs

---

## Acceptation

- [x] Checklist formalisée ; plus de surprise asymétrique sans mention dans la fiche AMB
