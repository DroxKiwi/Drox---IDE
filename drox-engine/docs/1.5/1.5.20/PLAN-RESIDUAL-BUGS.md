# Plan — bugs résiduels post-1.5.19 (1.5.20)

**Statut** : **ouvert**  
**Version** : 1.5.20  
**Objectif** : rétablir un chat IDE utilisable et absorber les régressions du ship 1.5.19.

---

## 1. Priorité A — IDE : impossible de parler au modèle

**Symptôme (utilisateur)** : en mode IDE (panneau Native Chat), l’envoi d’un message **ne permet plus** de dialoguer avec le modèle.

Pistes de départ (à valider en repro) :

| Zone | Indices 1.5.19 |
|------|----------------|
| Native Chat / session load | Handoff Agents→IDE, soft-timeout load session, empty-state |
| Bridge run / moteur | `drox.exe`, settings partagés, session workspace |
| Composer / send path | Préconditions UI (session absente, mode, modèle) |

### Repro minimal

1. Ouvrir un dossier workspace dans Drox IDE.
2. Panneau **Drox** (Native Chat) — nouvelle discussion ou session existante.
3. Choisir un modèle joignable (Ollama / API déjà OK en Agents si possible).
4. Envoyer « Salut » → **attendu** : bulle user + réponse / stream ; **actuel** : échec (à documenter : erreur UI, silence, timeout, …).

### Critère de done (A)

- Message user visible immédiatement.
- Run moteur démarré (stream ou erreur LLM explicite, pas un no-op).
- Pas de panneau bloqué « Loading session… » / zone chat absente.

---

## 2. Priorité B — inventaire résiduels

À compléter au fil du triage (cocher / ajouter) :

- [ ] Handoff Agents → Open in Editor (session correcte)
- [ ] Empty-state Native Chat
- [ ] Timeout / cancel load session
- [ ] Autres régressions signalées post-`v1.5.19`

---

## 3. Hors scope 1.5.20

- Universalisation tool calling → [1.5.21](../1.5.21/README.md)
- Index `@Codebase` / carte code → [1.5.22](../1.5.22/README.md)
- Nouvelles features Git Graph

---

## 4. Liens

- Clôture 1.5.19 : [CLOSURE-1.5.19.md](../1.5.19/CLOSURE-1.5.19.md)
- Handoff session : `src/vs/workbench/contrib/drox/common/droxIdeSessionHandoff.ts`
- Vue IDE : `src/vs/workbench/contrib/drox/browser/chat/droxNativeChatViewPane.ts`
