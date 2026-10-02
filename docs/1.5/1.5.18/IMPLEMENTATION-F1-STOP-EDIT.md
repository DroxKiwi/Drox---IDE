# Implémentation F1 — Stop / restore / edit (UX agent compacte)

**Version** : 1.5.18 · **Date** : 2026-07-22  
**Plan** : [PLAN-SESSION-RESUME.md](PLAN-SESSION-RESUME.md)

---

## F1a — Stop avant réponse → restore input ✅

**Fichier** : `src/vs/workbench/contrib/drox/browser/chat/droxChatCancelRestore.ts`

Action `drox.chat.cancelWithRestore` (remplace le Cancel stock quand `lockedCodingAgentId === drox`) :

1. `cancelCurrentRequestForSession`
2. Si **aucune** sortie visible (pas de markdown / tools / edits) → `removeRequest` + `input.setValue(messageText)`
3. Sinon → ne rien retirer (F1b)

Cancel stock masqué pour Drox via `lockedCodingAgentId.notEqualsTo('drox')` dans `CancelAction`.

---

## F1b — Stop mid-réponse → garder l’affichage ✅

Comportement par défaut du cancel chat (`model.cancelRequest`) : bulle user + début assistant figés. Aucune suppression si contenu visible (voir F1a).

---

## F1c — Éditer + Keep / Discard ✅

| Changement | Fichier |
|------------|---------|
| `supportsCheckpoints: true` | `droxAgentsChatContribution.ts` — active `editable` + truncate au renvoi |
| `allowsCodingAgentRequestEdit` | `chatContextKeys.ts` — menus Edit/Undo visibles pour Drox |
| Menus edit | `chatEditingActions.ts` — utilise `allowsCodingAgentRequestEdit` |
| Dialog Keep / Discard | `chatWidget.ts` `acceptInput` — si édition Drox + réponse partielle |

**Dialog** :

- **Discard & restart** → flux checkpoint (tronque + renvoi)
- **Keep partial** / Cancel → abandonne l’édition, remet le texte édité dans l’input (envoi manuel possible en follow-up)

---

## Smoke manuel F1

1. Envoyer « hello », stop immédiat → input = « hello », fil sans ce tour.  
2. Laisser 2–3 phrases, stop → fil conserve user + partial.  
3. Edit dernier user → Discard → nouvelle réponse depuis le texte édité.  
4. Edit → Keep → partial intact, texte édité dans l’input.  
5. Répéter IDE + Agents.
