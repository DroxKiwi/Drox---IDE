# Plan — Historique + Changes IDE (1.5.20)

**Statut** : **implémenté / smoke**  
**Version** : 1.5.20  
**Objectif** : stabiliser la gestion d’historique (Agents), porter les mêmes features côté IDE (dossier ouvert uniquement), et porter Changes IDE avec catégories multi-repos git sous le parent ouvert.

Audits liés : [AUDIT-IDE-CHAT-LOADING.md](AUDIT-IDE-CHAT-LOADING.md) · [AUDIT-MUSE-GLIMMER-LOOP.md](AUDIT-MUSE-GLIMMER-LOOP.md) · [PLAN-RESIDUAL-BUGS.md](PLAN-RESIDUAL-BUGS.md)

---

## Décisions produit

| Sujet | Décision |
|-------|----------|
| « Parité » historique | Mêmes **features de gestion** (liste, multi-delete, groupes, refresh) — pas forcément le même chrome Sessions |
| Filtre IDE historique | Uniquement sessions du **répertoire ouvert** (`folders[0]`) |
| Changes IDE | Même UX Agents (widget inline) ; **activity bar Sidebar** (pas aux) ; merge multi-git |
| Outils / sessions agent | Toujours bornés à `folders[0]` — le multi-git est **affichage Changes seulement** |
| Commit/Push IDE | **Hors scope** (SCM natif) |
| Shell discussion unifié Agents ↔ IDE | **Hors scope** → [1.5.21](../1.5.21/PLAN-SHARED-DISCUSSION-SHELL.md) |

---

## Ordre d’implémentation

```text
A Load IDE (overlay off + soft-fail)
  → B History stabilize Agents (delete / batch / groupes / recency)
    → C History UI IDE (même folder)
      → D Changes IDE multi-git categories
```

---

## A — Load IDE

- Retirer `DroxSessionLoadingOverlay` du panneau native chat.
- Soft-fail / empty-first : pas de double timeout 15 s opaque.
- Fichier : `src/vs/workbench/contrib/drox/browser/chat/droxNativeChatViewPane.ts`

---

## B — Stabiliser historique Agents

**Bugs** : delete puis liste qui « grandit » / sessions qui reviennent.

**Cause probable** : soft-fail delete disque + `_loadPersistedSessions` réinjecte ; multi-delete non atomique.

| Étape | Action |
|-------|--------|
| B1 | Delete **strict** : erreur si disque échoue ; pas d’éviction seule ; purge recency |
| B2 | Multi-delete **batch** + un refresh cohérent |
| B3 | Groupes : membership nettoyé après delete |

Fichiers : `droxSessionsProvider.ts`, `droxSharedChatSessionHistory.ts`, `sessionGroupsService.ts`

**Done** : supprimer 1 ou N → disparition définitive ; pas de fantômes au refresh.

---

## C — Historique IDE

- Même pile list/delete/groupes, filtrée sur `workspace.folders[0].fsPath`.
- UI dans le leaf Drox (liste + actions), source `<ws>/.drox/sessions/`.
- Handoff Agents→IDE seulement si même `workspaceFsPath`.

**Done** : IDE voit / ouvre / supprime / groupe uniquement les chats du dossier ouvert.

---

## D — Changes IDE (Sidebar + widget Agents)

1. View container Sidebar `workbench.view.drox.changesContainer` (icône activity bar, comme SCM).
2. UI = `DroxChangesInlineDiffWidget` (Open all / Clean / Dismiss / cartes) — même pile qu’Agents.
3. Merge session + dirty git via `buildDroxIdeChangesCategories` (multi-root → liste plate).
4. Edits session rattachés au root contenant le path ; dirty git par root.

**Done** : icône Changes à gauche ; clic → panneau à la place de l’Explorer ; parité widget Agents.

---

## Hors scope

- Tool calling universel → 1.5.21
- Codebase index / carte → 1.5.22
- Multi-root tools
- Commit/Push depuis Changes IDE
- Boucle Muse (piste parallèle M1/M2)

---

## Smoke

1. Agents : multi-delete + groupes + refresh.
2. IDE : historique même folder seulement.
3. Changes IDE : 1 repo vs parent multi-git.
4. Chat IDE : « Salut » après load sans overlay bloquant.

### Checklist smoke (impl.)

| Check | Attendu |
|-------|---------|
| Agents delete 1 session | Disparait ; refresh ne la réinjecte pas |
| Agents multi-delete | Un batch `removed` ; liste stable |
| IDE Session History | Liste = `folders[0]` ; delete / group ; trash item |
| IDE Changes mono-repo | 1 section Changes |
| IDE Changes parent multi-git | N sections (basename root) |
| Chat IDE load | Composer utilisable sans overlay timeout |
