# Plan — Théming Drox (fin de maj 1.5.22)

**Parent** : [README 1.5.22](README.md)  
**Statut** : 📋 noté · **avant-dernier** (après PF + AG, avant DOC)  
**Ordre** : **THEME** → puis [pass docs](README.md) (**DOC**)

## Intention

Revoir le **système de theming au complet** :

1. **Coller au principe VS Code** — thèmes color / file-icon / product-icon importables (Marketplace, JSON utilisateur, `workbench.colorCustomizations`), sans fork opaque qui casse l’écosystème.
2. **Identité Drox** — un (ou deux) thème(s) embarqué(s) avec une vraie signature visuelle (vert Drox `#3D7A3D`, chrome cohérent), pas un simple recolorage bleu VS Code.

## Hors scope immédiat

Pas d’implémentation dans le train R0–R11 régulation. Ce plan est un **jalon de fin de maj** uniquement.

## Critères done (brouillon)

- [ ] Audit : ce qui est déjà « VS Code native » vs overrides Drox (Nexus Dark/Light, CSS chat/Agents, splash).
- [ ] Thème identité : accent vert partout où l’ancien cyan VS Code / Nexus bleu fuyait encore.
- [ ] Import utilisateur : un `.json` / extension thème tierce s’applique sans régression chrome Drox (ou régression documentée / opt-in).
- [ ] Doc courte : comment changer / importer un thème dans Drox.
