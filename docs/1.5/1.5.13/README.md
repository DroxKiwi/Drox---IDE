# Drox 1.5.13 — Stabilisation fenêtre Agents

**Statut** : **livré** · branche `1.5.13` · tag **`v1.5.13`**  
**Base** : [1.5.12](../1.5.12/README.md) livrée (`v1.5.12`)

---

## En une phrase

Rendre l’app **fiable en prod** : fil visible au switch session/dossier, moins de lenteur et de crashs — le reste en second.

---

## Doc

| Fichier | Rôle |
|---------|------|
| **[PLAN-1.5.13.md](PLAN-1.5.13.md)** | Checklist S1–S18 |
| [SMOKE-1.5.13.md](SMOKE-1.5.13.md) | Retours terrain |
| [DEBUG-1.5.13.md](DEBUG-1.5.13.md) | Freeze / crash — comment débugger |
| [NOTES-CHARGEMENT-FIL.md](NOTES-CHARGEMENT-FIL.md) | Détail flux chargement |

---

## Ordre d’attaque (rapide)

1. **S1–S4** — fil vide + replay tail → smoke → ship possible  
2. **S5–S8** — perf + validation install  
3. **S9–S11** — reports 1.5.12 si marge  
4. **S12–S16** — nettoyage sans impact runtime (quand CI verte)

---

## Liens

- [Hub 1.5](../README.md)
- [PLAN 1.5.12](../1.5.12/PLAN-1.5.12.md)
