# Idée 06 — Chargement segmenté des discussions historisées

**Statut** : idée validée terrain (dogfooding) — cible **post-1.3.1**  
**Date** : 2026-06-02  
**Priorité** : haute UX (pas bloquant release 1.3.1)

---

## Résumé

La **reprise de session** (historique chat + journal UI) **fonctionne** et reste fidèle au run d’origine.  
En revanche, sur les sessions longues, le chargement est **trop lent** : tout le journal est rejoué d’un bloc avant d’afficher quoi que ce soit d’utile.

**Objectif** : charger **par segments**, afficher **d’abord la fin** (derniers messages / état récent), puis compléter l’historique en arrière-plan si besoin.

---

## Problème actuel

| Comportement | Limite |
|--------------|--------|
| Ouvrir un onglet / charger une session | Rejoue **tout** le `ui-replay` (ou tout le transcript) séquentiellement |
| Message système « Restoring session UI (N events)… » | L’utilisateur attend sans voir le fil utile |
| Sessions longues (dogfooding, runs multi-heures) | Latence perceptible, mauvaise 1ʳᵉ impression |

**Code concerné (piste)** :

- `droxChatTabsManager.activateChatTab` → `readUiReplay` puis `replayUiJournalMessages` (tout d’un coup)
- Fallback : `replayTranscriptMessages` si pas de journal UI
- Fichiers : `droxSessionReplay.ts`, `droxSessionService.readUiReplay`, webview chat

---

## Vision produit

1. **Phase 1 (immédiat)** : afficher les **N derniers événements** (ou dernière fenêtre temporelle) — fil utilisable en < 1 s ressenti.
2. **Phase 2 (arrière-plan)** : charger le reste vers le haut (pagination / chunks), avec indicateur discret (« historique en cours… »).
3. **Option** : bouton « Charger tout l’historique » si l’utilisateur veut remonter au début sans bloquer l’ouverture.

```text
Ouvrir session ses_xxx
  → afficher tout de suite : derniers messages + état busy/phase/todo courant
  → en parallèle : rejouer chunk par chunk le reste (ou sur demande)
```

---

## Pistes techniques

| Piste | Détail |
|-------|--------|
| **Tail replay** | Lire les **dernières L lignes** du `ses_*.ui-replay.jsonl` (seek fin de fichier) |
| **Index session** | Métadonnée `eventCount` + offsets dans un sidecar `.index.json` à l’écriture |
| **Chunk size** | ex. 50–100 messages UI par batch, `requestAnimationFrame` / yield entre batches |
| **Transcript fallback** | Si pas de UI replay : ne charger que les **k derniers** messages transcript pour l’aperçu |
| **Annulation** | Si l’utilisateur change d’onglet pendant le backfill, annuler le replay en cours |

---

## Critères d’acceptation (MVP)

- [ ] Ouvrir une session longue (> 500 événements UI) : **contenu récent visible** en quelques secondes max.
- [ ] Pas de freeze UI prolongé du workbench pendant le replay.
- [ ] Comportement identique à aujourd’hui une fois l’historique complet chargé (ou sur action explicite).
- [ ] Test : fermer IDE → rouvrir → même session (cf. [CRITERES-TEST-REEL.md](../1.3/1.3.0/finalisation/CRITERES-TEST-REEL.md) T7).

---

## Hors périmètre (pour cette idée)

- Refonte complète du format `ui-replay` (sauf index léger).
- Virtualisation scroll infinie du fil (peut venir après).

---

## Liens

- [CRITERES-TEST-REEL.md](../1.3/1.3.0/finalisation/CRITERES-TEST-REEL.md) — reprise session
- [UI-DISPLAY-LINEAR-WORKFLOW.md](../1.2.0/steps/09-ui/UI-DISPLAY-LINEAR-WORKFLOW.md) — replay historique
- [CLOSURE-1.3.1.md](../1.3/1.3.1/finalisation/CLOSURE-1.3.1.md) — backlog post-release
