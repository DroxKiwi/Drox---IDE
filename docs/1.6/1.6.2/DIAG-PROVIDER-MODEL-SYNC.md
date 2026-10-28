# Diagnostic — modèle affiché ≠ modèle du run (changement de provider)

## Symptôme

Après changement de connexion (cloud ↔ self-hosted), le toolbar affiche un modèle du **nouveau** catalogue, mais `agent.run` envoie encore l’**ancien** nom → 403 / « model not available for this API key ».

## Cause

| Couche | Rôle |
|--------|------|
| Picker chat natif | Affiche un `ILanguageModelChatMetadata` (liste rafraîchie après `DroxLlmModelsService.refresh`) |
| Run moteur | Lit **`drox.architect.model`** (`readLlmSettings` → `buildAgentRunParams`) |

Lors d’un reset automatique du picker (`setCurrentLanguageModelToDefault` après `checkModelSupported`), la config **n’était pas** mise à jour tant que l’utilisateur ne choisissait pas explicitement le modèle (`isUserAction`).

## Correctif (1.6.2)

1. `chatInputPart.setCurrentLanguageModel` — sync vers `drox.architect.model` aussi pour les changements **automatiques** (sessions Drox).
2. `DroxLlmModelsService.refresh` — si le modèle persisté ∉ liste, persister le **premier** modèle chat du catalogue.
3. `DroxIdeModelPicker.ensureValidModel` — même réconciliation côté picker IDE.

## Vérification manuelle

1. Provider A + modèle X, run OK.
2. Passer provider B, attendre la liste modèles.
3. Envoyer un message **sans** rouvrir le picker → l’erreur ne doit plus citer le modèle X.
