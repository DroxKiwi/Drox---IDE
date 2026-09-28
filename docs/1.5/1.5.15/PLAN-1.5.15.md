# Plan 1.5.15 — Hors workspace · Retry · Carnet de session

**Branche** : `1.5.15`  
**Version** : `droxVersion` **1.5.15**  
**Statut** : en cours (OW livré · RT+NB implémentés)  
**Base** : hors-workspace déjà livré (toggle cadenas) · Retry + Carnet en code

---

## En une phrase

Finaliser 1.5.15 avec (1) un **Retry** visible sur erreur LLM (Agents + IDE), et (2) un **carnet markdown par discussion** (icône note, persistant, modal editor, accessible au modèle) — **sans** alourdir le cœur du moteur Rust.

---

## Périmètre global

| Pilier | Code | Statut plan |
|--------|------|-------------|
| **OW** — Allow outside workspace | Toggle + `allowOutsideWorkspace` | ✅ livré (commit ouverture) |
| **RT** — Retry erreur moteur | UI + recovery existante | ✅ IDE (Retry sur bulle) + Agents (`confirmationButtons`) |
| **NB** — Carnet / notepad session | `.drox/sessions/<id>.notes.md` + injection | ✅ N0 (zéro Rust, `system` via bridge) |

Docs liées : [README](README.md) · hors-workspace déjà décrit dans le README.  
**Trace moteur Rust (audit)** : [ENGINE-RUST-1.5.15.md](ENGINE-RUST-1.5.15.md).

---

# Partie A — Retry (RT)

## A.1 Objectif UX

Quand le moteur / LLM renvoie une erreur **bloquante** (HTTP 502, timeout, `agent/done` en erreur, échec `agent.run`, …) :

1. Afficher clairement l’erreur dans le fil.
2. Proposer un bouton **Retry** (un clic).
3. Au clic : **retirer / masquer l’échec** du fil (ou le remplacer), puis **relancer le dernier message utilisateur** sans que l’utilisateur le retape.

Surfaces : **fenêtre Agents** et **chat IDE** (webview / natif).

## A.2 Implémentation

| Surface | Mécanisme |
|---------|-----------|
| IDE | Bouton **Retry** sur `.msg.error` → `restartRunAfterError` (truncate + `skipUserTurn`) ; Reprendre / Recommencer inchangés sur le message user |
| Agents | `errorDetails.confirmationButtons` → `droxAgentsRetry` ; restore dernier prompt + truncate + `skipUserTurn` |

## A.3 Critères d’acceptation Retry

- [x] 502 / erreur `agent.run` → bouton Retry visible (IDE + Agents)
- [x] Un clic relance sans retaper le message
- [x] L’erreur n’encombre plus le fil après relance (clear after user / nouvel état busy)
- [x] Pas de double tour user dans le transcript (`skipUserTurn` + truncate)

## A.4 Hors scope Retry

- Retry automatique silencieux — **non**
- Retry sur erreurs tools isolées — **non**
- Changer le protocole JSON-RPC moteur — **non**

---

# Partie B — Carnet de session (NB)

## B.1 Décisions verrouillées

| Choix | Valeur |
|-------|--------|
| Chemin | `<workspace>/.drox/sessions/<sessionId>.notes.md` |
| Stratégie moteur | **N0 (zéro Rust)** — injection `params.system` |
| Plafond | **12 KiB** + `(truncated)` |
| Template | EN (Rules / Ideas / Free) |
| Ouverture | `IEditorService.openEditor(..., MODAL_GROUP)` **uniquement** dans l’action notes |
| Delete | `droxSessionArtifactPaths` inclut `.notes.md` |

## B.2 Critères d’acceptation Carnet

- [x] Icône note sur carte historique (`Codicon.note`)
- [x] Fichier créé avec template (création session / premier run / open)
- [x] Persiste après restart app
- [x] Disparaît à la suppression de discussion
- [x] Modal Editor path-scoped (pas de règle globale)
- [x] Contenu injecté via `startDroxAgentRun` → `system`
- [x] Aucune modification `agent.rs` / registry tools

## B.3 Checklist « pas d’effet de bord »

- [x] Pas modifié `agent.rs`
- [x] Pas ajouté d’outil
- [x] Pas changé `path_util` / permissions pour le carnet
- [x] Pas couplé à `session_note` / memdir archives
- [x] Modal Editor scoped à l’action

---

# Ordre d’implémentation

```text
1. RT — Retry IDE     ✅
2. RT — Retry Agents  ✅
3. NB — FS + UI       ✅
4. NB — Injection N0  ✅
5. Smokes / ship      ⬜
```

---

## Références code

- Trace Rust OW : [ENGINE-RUST-1.5.15.md](ENGINE-RUST-1.5.15.md)
- Recovery IDE : `droxChatRunRecovery.ts` · `run-recovery.js`
- Agents Retry : `droxAgentsSessionHandler.ts`
- Carnet : `droxSessionNotesFs.ts` · `droxAgentRunBridge.ts` · `droxSessionsBackgroundActions.ts`
- Delete : `droxSessionDeleteFs.ts`
