# Smoke manuel — orchestration 1.2.0

**Date** : 2026-05-20  
**Statut** : procédure — à exécuter à partir de **P3**  
**Prérequis** : `DROX_ORCHESTRATION=v1_2` (ou `nexus.drox.orchestrationMode=v1_2`), moteur compilé, Ollama avec modèles architecte + exécuteur.

---

## Pré-vols automatisés (sans LLM)

```powershell
.\scripts\smoke-orchestration-preflight.ps1
```

Couvre : tests `orchestration` / `run_spec` / `delegate_report` (Rust) + tests unitaires `contrib/drox`.

---

## Préparation

```powershell
. .\scripts\use-nvm-node.ps1
npm run compile   # ou watch actif
$env:DROX_ORCHESTRATION = 'v1_2'
.\scripts\code.bat
```

Configurer **Settings → Drox** : `nexus.drox.orchestrationMode` = `v1_2`, modèles **Architect** et **Executor** (vignettes rôle dans le composer).

---

## Scénario 1 — Tâche simple (pas de sur-orchestration)

**Prompt** : « Ajoute un commentaire `// smoke 1.2.0` en tête de README.md »

| # | Critère | ☐ |
|---|---------|---|
| 1 | Réponse en temps raisonnable sans lancer 5+ sous-runs | ☐ |
| 2 | Fichier modifié correctement | ☐ |
| 3 | UI : pas de rafale d’onglets exécutants inutiles | ☐ |

---

## Scénario 2 — Deux objectifs séquentiels

**Prompt** : « Corrige la typo "recieve" → "receive" dans README.md et dans DROX.md »

| # | Critère | ☐ |
|---|---------|---|
| 1 | Plan ou séquence visible (phases / logs rôle architecte) | ☐ |
| 2 | Deux mutations distinctes | ☐ |
| 3 | Synthèse finale claire pour l’utilisateur | ☐ |

---

## Scénario 3 — Legacy inchangé

```powershell
$env:DROX_ORCHESTRATION = 'legacy'
```

Répéter scénario 1 — comportement identique au pré-1.2.0.

| # | Critère | ☐ |
|---|---------|---|
| 1 | Pas de régression visible | ☐ |

---

## Scénario 4 — Parallèle (P4+)

**Prompt** : « En parallèle : résume le dossier `drox-engine/docs/1.2.0` et liste les crates sous `drox-engine/drox/crates` »

| # | Critère | ☐ |
|---|---------|---|
| 1 | Deux branches disjointes | ☐ |
| 2 | Pas de blocage mutuel anormal | ☐ |
| 3 | VRAM / Ollama : pas plus de modèles chargés que la config | ☐ |

---

## Journal smoke

| Date | Scénarios | Résultat | Notes |
|------|-----------|----------|-------|
| | | | |
