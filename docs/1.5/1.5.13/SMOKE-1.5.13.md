# Smoke 1.5.13 — retours terrain

**Complète** : [PLAN-1.5.13.md](PLAN-1.5.13.md) · **Debug** : [DEBUG-1.5.13.md](DEBUG-1.5.13.md)

---

## Session 2026-07-03

| # | Scénario | Résultat | Correctif |
|---|----------|----------|-----------|
| **T1** | Switch discussion / dossier | ✅ Validé (2026-07-03) | S1–S4 |
| **T2** | Nouveau dossier → discussion → réponse modèle | ✅ Validé (2026-07-03) | S2-3 / S3-bis + send non bloquant |
| **T3** | **Relance app** sans action | ✅ Validé (logs + UI) | S5 lazy + S5-bis git |
| **T-layout** | Boot / New Session : centre + arborescence projets | ✅ Validé | ResizeObserver + relayout sync |

### Correctif T-layout (2026-07-03)

Écran « New Session » noir et projets absents à gauche jusqu’à un clic / alt-tab : course layout entre montage widget et dimensionnement grille.

- `SessionView` / `SessionsPart` : `ResizeObserver` + relayout synchrone (sans `rAF` fragile)
- `NewChatWidget` : layout Monaco dès que le conteneur a une taille
- `SessionsView` / `SessionsList` : observer taille liste + sync visibilité `ViewPane`
- CSS : affichage immédiat du compositeur (sans fade-in retardé)

### Hypothèse T2

`SessionView` → `setChat` via **autorun** à chaque tick (`onDidChangeSessions`, statut, git Changes). Evict + `_clearCurrentChat` en boucle.

### Hypothèse T3 — **confirmée en log**

```text
Autorun '(anonymous)' is stuck in an infinite update loop.
  → GitRepository.updateState
  → droxSessionsProvider._attachGitRepositoryState (autorun)
```

L’autorun git **lisait** `session.workspace` et **réécrivait** `updateWorkspace()` à chaque tick git → boucle observable.

**Correctif S5-bis** : ne mettre à jour le workspace que si branche / upstream / `uncommittedChanges` changent ; supprimer le 2ᵉ autorun redondant ; skip `setChanges` si identique.

---

## À revalider

- [x] **T3** : idle 2 min — OK (logs + UI confirmés 2026-07-03)
- [x] **T-layout** : boot + New Session — centre et sidebar OK (2026-07-03)
- [x] **T2** : nouveau dossier → discussion → fin de réponse — OK (2026-07-03)
- [x] **T1** : switch A → B → A + ProjectBar — OK (2026-07-03)

---

## Liens

- [DEBUG-1.5.13.md](DEBUG-1.5.13.md)
- [PLAN-1.5.13.md](PLAN-1.5.13.md)
