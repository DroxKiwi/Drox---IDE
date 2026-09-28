# Plan — intégration upstream VS Code 1.122

**Date** : 2026-05-25  
**Branche cible** : `integrate/vscode-1.122` ← `1.2.0` (ou `main`)  
**Référence** : [ARCHITECTURE-DECOUPLAGE-UPSTREAM.md](./ARCHITECTURE-DECOUPLAGE-UPSTREAM.md)

---

## 1. État au diagnostic

| Mesure | Valeur |
|--------|--------|
| Fork Nexus (`package.json`) | **1.115.0** · distro `75e88c7…` |
| Upstream `main` (fév. 2026) | **1.122.0** · distro `9897f32…` |
| Ancêtre commun (`merge-base`) | `3b940c2d3e4` — *Add performance profiler command* |
| Commits Nexus depuis la base | **3** |
| Commits upstream depuis la base | **~4970** |
| Remote `upstream` | `https://github.com/microsoft/vscode.git` ✅ |

Le moteur (`drox-engine/`) et l’UI (`contrib/drox/`) ne sont **pas** dans le dépôt Microsoft : ils survivent au merge tant que Git ne les supprime pas.

---

## 2. Ordre de résolution des conflits

1. **Automatique / theirs** pour tout le noyau Microsoft sans marqueur Nexus.
2. **Ours** pour `drox-engine/**`, `contrib/drox/**`, `resources/drox/**`.
3. **Manuel** — registre §5 de `ARCHITECTURE-DECOUPLAGE-UPSTREAM.md` :
   - `app.ts` — garder bloc `DROX-NEXUS-START` … `END`
   - `workbench.*.main.ts` — garder les 2 imports Drox
   - `product.json` — fusionner branding KDDS + champs upstream
   - `welcomeGettingStarted/*`, `contrib/chat/*` — au cas par cas
4. Rejouer `.\scripts\list-nexus-patches.ps1` après merge.

---

## 3. Commandes (PowerShell)

```powershell
# Déjà fait une fois :
git remote add upstream https://github.com/microsoft/vscode.git
git fetch upstream main

# Branche d'intégration
git checkout 1.2.0
git checkout -b integrate/vscode-1.122
git merge upstream/main

# Après résolution conflits :
npm install
npm run compile
cd drox-engine\drox; cargo test --workspace; cd ..\..
.\scripts\code.bat
# Smoke : Drox Open Chat → agent.run → tool

# Si OK :
git checkout 1.2.0
git merge integrate/vscode-1.122
git push origin 1.2.0
```

---

## 4. Critères de succès (checklist)

- [x] `npm run compile` sans erreur
- [ ] `cargo test --workspace` vert dans `drox-engine/drox`
- [ ] `droxCommon.test.ts` (fork) vert si exécuté
- [ ] Chat Drox ouvre et stream une réponse
- [ ] Bloc `DROX-NEXUS` présent dans `app.ts`
- [ ] `package.json` version ≥ 1.122.0 (ou version cible choisie)

---

## 5. Si le merge est trop lourd

Alternative : merge par **tag** intermédiaire (ex. `1.118.0`, `1.120.0`) pour réduire le volume de conflits par étape.

---

## 6. Journal

| Date | Action | Résultat |
|------|--------|----------|
| 2026-05-25 | `upstream` ajouté, fetch `main` | merge-base `3b940c2` |
| 2026-05-25 | Marqueurs `DROX-NEXUS` dans `app.ts`, `workbench.*.main.ts` | Prêt merge |
| 2026-05-25 | `git merge upstream/main` sur `integrate/vscode-1.122` | **OK** — 11 conflits résolus ; commit `1c74b121104` |
| 2026-05-25 | `hygiene.ts` : chemins avec espaces (Windows) | `git show ":path"` |
| 2026-05-25 | `languageModels.ts` | Patch Nexus `defaultChatVendorId` + resolve early |
| 2026-05-25 | Node **22.22.1** via nvm4w | `nvm use 22.22.1` + script `scripts/use-nvm-node.ps1` (priorise nvm vs Node Cursor) |
| 2026-05-25 | `npm install` | OK avec Node 22.22.1 |
| 2026-05-20 | `npm run compile` | **OK** — 11 erreurs TS corrigées (Drox + `chatModelsViewModel.test`) |
| 2026-05-20 | `.\scripts\test-drox.ps1` | **OK** — 60 tests |
| 2026-05-20 | `.\scripts\code.bat` (lancement) | **OK** — process démarre |
| | Smoke manuel chat Drox (agent.run) | *optionnel* |
