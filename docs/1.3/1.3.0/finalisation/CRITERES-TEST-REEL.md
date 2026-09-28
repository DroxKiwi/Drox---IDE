# Critères — test réel « projet entier » (> 15 min)

**Objectif** : valider Nexus IDE + Drox sur un vrai repo (ex. site vitrine), pas seulement des smokes courts.

**Date** : 2026-05-27

---

## Scénario recommandé

1. Ouvrir le workspace du site (branche propre ou clone dédié).
2. Lancer une session Drox, tâche réaliste (feature, contenu, refactor section).
3. Laisser tourner **≥ 20–30 min** (orchestration, plusieurs tours architecte, au moins un batch exécuteur si parallèle activé).
4. **Fermer** l’onglet ou l’IDE, **rouvrir** la session — vérifier reprise UI / transcript.
5. Continuer 10 min (deuxième cycle) ou enchaîner une nouvelle demande.

---

## Grille de validation

| # | Critère | OK | KO | Notes |
|---|---------|----|----|-------|
| T1 | Pas de crash IDE / extension host | ☐ | ☐ | |
| T2 | Chat reste utilisable après 15 min (scroll, stop, envoi) | ☐ | ☐ | |
| T3 | Indicateur architecte visible en bas du fil pendant le run | ☐ | ☐ | |
| T4 | Phrases d’accroche / grille sans doublon gênant | ☐ | ☐ | |
| T5 | Cartes exécuteur lisibles (pas de JSON brut) | ☐ | ☐ | |
| T6 | Réponse finale au bon endroit (pas sous le cycle suivant) | ☐ | ☐ | |
| T7 | Reprise session : layout fidèle (journal UI si dispo) | ☐ | ☐ | |
| T8 | Fichiers modifiés cohérents avec la demande | ☐ | ☐ | |
| T9 | `.drox/sessions/` + `.drox/agent-output/` sans corruption | ☐ | ☐ | |
| T10 | Mémoire / CPU acceptables (pas de freeze prolongé) | ☐ | ☐ | |
| T11 | Stop run répond < quelques secondes | ☐ | ☐ | |
| T12 | Ollama / modèles : pas de saturation bloquante | ☐ | ☐ | |

---

## Signaux d’échec à capturer

- Logs : panneau Output Drox, terminal moteur, `.build/log` si build local.
- Copie d’écran du fil chat au moment du bug.
- Fichier `ses_*.ui-replay.jsonl` présent ou absent (reprise).
- Version IDE / commit git notés dans le rapport.

---

## Rapport minimal (template)

```markdown
## Test réel — [date]
- Projet : …
- Durée : … min
- Modèle architecte / exécuteur : …
- Résultat global : PASS / FAIL

### Ce qui a bien marché
- …

### Problèmes
1. …

### Bloquants pour distribution 1.3.0 ?
- oui / non — …
```

Déposer les retours détaillés dans `docs/1.3/1.3.1/retour_discussion/` si besoin.
