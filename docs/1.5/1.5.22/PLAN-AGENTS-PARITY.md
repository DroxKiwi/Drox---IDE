# Plan — Parité Agents (1.5.22)

**Parent** : [README 1.5.22](README.md)  
**Statut** : ✅ **MVP livré** (Codebase + Regulation) · gap-list figée  
**Ordre maj** : après A–D (R11) · puis DOC (R12) — **enchaînement terminé**  
**Note** : PF et THEME → [1.5.23](../1.5.23/README.md).

## 0. But

Rendre **accessibles côté fenêtre Agents** les capacités livrées surtout dans l’IDE principal pendant 1.5.21 / 1.5.22 — en particulier Embed / Codebase et la console Regulation.

## 1. Modèle produit (figé)

1. Une **discussion Agents** est liée à un **chemin racine** (création / workspace de session).  
2. **Codebase** et **Regulation** sont scopés à ce répertoire — mêmes services que l’IDE (`IDroxCodebase*`, `IDroxRegulationService`).  
3. Entrée UI principale : **icônes sur la toolbar des badges d’historique** (`SessionItemToolbarMenuId`, à côté de persist / lock / notes).  
4. Entrées secondaires : chips composer (Codebase déjà là + Regulation) ; activity bar sidebar (vues enregistrées dans le bootstrap Agents).  
5. **RAG / auto-index** : lazy sur la discussion **active** uniquement — **pas** d’index de tout l’historique. File **séquentielle 1-root** avec **coalesce** (dernier `schedule` gagne si un index tourne). Déclencheur = focus session (`setActiveRoot` / `active-root`).

## 2. Inventaire

| Capacité | IDE | Agents | Cible AG |
|----------|-----|--------|----------|
| Embed / index Codebase (cockpit, inject, catalogue CB3b) | ✅ sidebar + chip | ✅ toolbar historique + chip + sidebar | ✅ |
| Auto-régulation console (R3+) | ✅ vue Regulation | ✅ toolbar historique + chip + sidebar | ✅ |
| Sync racine discussion → cockpit / regulation | workspace open | ✅ `setActiveRoot` + `setActiveWorkspaceResource` sur session active | ✅ |
| Autres livraisons 1.5.21–22 (Explore, SAV, CB5) | — | — | N/A / reporté (hors AG) |

## 3. Principes

1. **Même services** — pas de second moteur.  
2. UI Agents = **surface** qui ouvre / pilote le même host (`droxCodebase.contribution`, `droxRegulation.contribution`).  
3. Pas de régression IDE ; override workspace actif seulement dans la fenêtre Agents.

## 4. Impl (fichiers clés)

- `sessions/.../droxSessionsBootstrap.ts` — importe les contributions vues Codebase + Regulation.  
- `sessions/.../droxSessionsCockpitActions.ts` — actions toolbar / menu contextuel.  
- `sessions/.../droxSessionsActiveSessionSync.ts` — pin racine session → supervision + run settings + histo regulation.  
- `workbench/.../droxOpenWorkbenchViews.ts` — IDE → sidebar · Agents → auxiliary bar.  
- `sessions/.../droxSessionsViews.contribution.ts` — hosts Aux Codebase/Regulation (`WindowEnablement.Sessions`).  
- Changement de discussion → sync root déjà via `droxSessionsActiveSessionSync` (cockpit ouvert suit le dossier).  
- `IDroxRunSettingsService.setActiveWorkspaceResource` — pin folder discussion pour la console Regulation.  
- `common/codebase/supervision/droxCodebaseAutoIndex.ts` — file 1-root + coalesce.

## 4b. RAG — contrat d’ordonnancement

| Question | Réponse figée |
|----------|----------------|
| Automatique ? | Oui — `ensureIndexed` en background (hash-skip) |
| Tous les dossiers de l’historique ? | **Non** |
| File d’attente ? | Oui, **séquentielle**, coalesce sur le **dernier** root |
| Déclencheur ? | Focus / clic discussion → `setActiveRoot` → `schedule('active-root')` |

Réf. runtime : [`docs/engine/codebase-and-rag.md`](../../engine/codebase-and-rag.md).

## 5. Done quand

- [x] Embed / Codebase utilisable depuis Agents (toolbar historique + cockpit).  
- [x] Regulation accessible depuis Agents (même locus).  
- [x] Gap-list 1.5.21–22 tranchée (fait / N/A).  
- [x] Auto-index lazy + coalesce documenté + test unitaire.  
- [ ] Smoke dogfood Agents + IDE (ouvrir icônes historique, vérifier root + cockpit / observatoire).

## 6. Docs liées

| Doc | Rôle |
|-----|------|
| [`docs/engine/codebase-and-rag.md`](../../engine/codebase-and-rag.md) | Référence runtime Codebase / RAG |
| [`docs/engine/model-regulation.md`](../../engine/model-regulation.md) | Observatoire + store par racine |
| [`docs/engine/ide-integration.md`](../../engine/ide-integration.md) | Surfaces IDE ↔ Agents |
| [`PLAN-CB2b.md`](../1.5.21/codebase/PLAN-CB2b.md) | Auto-index + ordonnancement Agents |
| [`PLAN-COCKPIT.md`](../1.5.21/codebase/PLAN-COCKPIT.md) | Hosts UI |
| [`docs/pedagogie/16-codebase-et-rag.md`](../../pedagogie/16-codebase-et-rag.md) | Lecture guidée |
| [`docs/tutorials/ide-navigation.md`](../../tutorials/ide-navigation.md) | Où cliquer |

## 7. Suite

~~DOC (R12)~~ — fait · [CLOSURE-1.5.22.md](CLOSURE-1.5.22.md).  
PF / THEME : [1.5.23](../1.5.23/README.md).
