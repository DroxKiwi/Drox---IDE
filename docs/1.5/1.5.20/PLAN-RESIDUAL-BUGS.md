# Plan — bugs résiduels + liens History/Changes (1.5.20)

**Statut** : **ouvert**  
**Version** : 1.5.20  
**Plan principal History/Changes** : **[PLAN-HISTORY-AND-CHANGES-IDE.md](PLAN-HISTORY-AND-CHANGES-IDE.md)**

---

## 1. Priorité A — IDE : timeout « Loading session… »

**Symptôme** : overlay → `Timed out loading the chat session…` → pas de chat.

**Audit** : [AUDIT-IDE-CHAT-LOADING.md](AUDIT-IDE-CHAT-LOADING.md)

| Phase | Action |
|-------|--------|
| **P0** | Supprimer `DroxSessionLoadingOverlay` du panneau IDE |
| **P1** | Soft-fail / empty-first — plus de double timeout 15 s opaque |
| **P2** | Diagnostiquer hang `acquireOrLoadSession` si besoin |

**Done** : composer utilisable rapidement ; Agents non régressé.

---

## 2. Historique + Changes (lot principal)

Voir [PLAN-HISTORY-AND-CHANGES-IDE.md](PLAN-HISTORY-AND-CHANGES-IDE.md) :

- **B** Stabiliser delete / groupes Agents
- **C** Historique IDE (même folder)
- **D** Changes IDE multi-git

---

## 3. Muse Glimmer — boucle thinking (parallèle)

**Doc** : [AUDIT-MUSE-GLIMMER-LOOP.md](AUDIT-MUSE-GLIMMER-LOOP.md)

Suite : M1 mid-stream repetition · M2 soft-close todos+testing — **non bloquant** pour History/Changes.

---

## 4. Hors scope 1.5.20

- Shell discussion unifié Agents ↔ IDE → [1.5.22](../1.5.22/PLAN-SHARED-DISCUSSION-SHELL.md)
- Universalisation tool calling → [1.5.21](../1.5.21/README.md)
- Index `@Codebase` / carte code → [1.5.23](../1.5.23/README.md)
- Commit/Push depuis Changes IDE

---

## 5. Liens code

- Vue IDE : `src/vs/workbench/contrib/drox/browser/chat/droxNativeChatViewPane.ts`
- Overlay : `src/vs/workbench/contrib/drox/browser/droxSessionLoadingOverlay.ts`
- Provider sessions : `src/vs/sessions/contrib/providers/drox/browser/droxSessionsProvider.ts`
- Changes git : `src/vs/workbench/contrib/drox/common/droxSessionGitChanges.ts`
