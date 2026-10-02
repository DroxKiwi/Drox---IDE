# Plan CB4 — Contexte `@Codebase` automatique + forçage utilisateur

**Parent** : [PLAN-CB3.md](PLAN-CB3.md) · [ARCHITECTURE.md](ARCHITECTURE.md)  
**Suite** : CB4b (réglages fins) · CB3b (catalogue) · CB5 (carte)  
**Statut** : 🔄 **in progress** · auto-inject + chip forçage (2026-10-02)

## Décision produit

L’utilisateur veut le système **le plus automatique et indépendant**, **le plus pertinent pour le modèle**, tout en pouvant **forcer** l’embed quand il le sent nécessaire.

| Couche | Comportement | Défaut |
|--------|----------------|--------|
| **Auto-inject** | À chaque `agent.run`, retrieval hybrid sur le message utilisateur → bloc contexte borné injecté (via `system` / complément run) **sans action UI** | **ON** |
| **Forçage utilisateur** | Chip / toggle « Joindre Codebase » (ou `@Codebase`) : relance ou élargit le retrieval (plus de hits / query = message + sélection éditeur) | Opt-in par tour |
| **Tool** | `codebase_search` reste disponible pour raffiner (2ᵉ passe, `path_prefix`) | Toujours (sauf disabled tools) |
| **Hint système** | Une ligne : intention → index ; symbole exact → `grep` | Toujours |

**Pas** de dépendance à « l’utilisateur doit penser à `@` » pour que ça marche. Le `@` / chip = **accélérateur / override**, pas le chemin nominal.

## Pourquoi ce mix (apps sérieuses)

- Auto-inject = le modèle reçoit déjà du terrain → moins d’oubli d’outil (GLM / petits modèles).  
- Tool = profondeur quand l’inject ne suffit pas.  
- Forçage = l’humain corrige le ranking ou ancre une zone (fichier ouvert).  
- Budget tokens = évite les coupures cloud (payload trop gros).

## Livrable CB4 (MVP)

1. **Module** `common/codebase/droxCodebaseContextPack.ts`  
   - `formatDroxCodebaseContextBlock(hits, opts) → { text, hitCount, chars }`  
   - top‑k défaut **6–8**, soft max **~4–6k chars**, preview tronqué.  
2. **Hook run** (Agents + IDE chat) avant `buildAgentRunParams` :  
   - si auto-inject ON et index idle avec chunks → pack + append `system`.  
   - skip si pas de root / index missing.  
3. **UI forçage** : chip composer — états `Auto` / `Forced` / `Off` ; clic = force inject élargi pour le prochain envoi.  
4. **Setting** `drox.codebase.autoInject` (défaut `true`) + `drox.codebase.autoInjectMaxChars`.  
5. **Observabilité (cockpit)** : section **Last auto-inject** (badges Auto ON/OFF, résumé hits/chars/ms, liste hits) + event pipeline `search` + champ `lastInject` dans Export diag.  
6. Docs hub : CB4 = in progress → done après dogfood.

## Hors scope CB4

- Catalogue admin (CB3b)  
- Carte code (CB5)  
- SAV erreurs LLM (fin 1.5.21)  
- Remplacer `grep` / Explore
- ~~Filtrage ranking README/tsbuildinfo (CB4b)~~ → [PLAN-CB4b.md](PLAN-CB4b.md)

## Critères d’acceptation

1. Sans toucher l’UI : un prompt d’intention (ex. stats téléchargements) reçoit déjà des chunks utiles dans le run (visible dans export / system).  
2. Chip forçage : un tour avec éditeur sur `page.tsx` + force → hits recentrés / plus nombreux.  
3. Setting OFF → plus d’inject auto ; le tool `codebase_search` fonctionne encore.  
4. Soft max respecté (pas de dump de 50 fichiers).

## Ordre d’implémentation

1. Pack + hook inject (sans UI) + setting défaut ON  
2. Hint système  
3. Chip forçage composer  
4. Dogfood prompt sémantique + export  

## Risques

| Risque | Mitigation |
|--------|------------|
| Bruit / mauvais hits | top‑k bas, hybrid, score floor, dédup |
| Payload cloud trop gros | soft max chars + setting |
| Double emploi tool + inject | hint : tool = raffiner, pas re-chercher à l’aveugle |
| Latence auto-inject | search local déjà rapide ; timeout soft 1–2 s puis skip |
