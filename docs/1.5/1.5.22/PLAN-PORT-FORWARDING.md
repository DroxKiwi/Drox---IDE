# Plan — Port forwarding (1.5.22)

**Parent** : [README 1.5.22](README.md)  
**Statut** : 📋 **cadrage** · **avant-avant-dernier** avant la clôture docs  
**Ordre maj** : après A–D (R11) · avant Agents parity · avant DOC

## 0. But

Renseigner puis reproduire un **système de port forwarding** utilisable chez Drox :

- en **local** (dev / preview d’un serveur lancé par l’agent ou l’utilisateur) ;
- et/ou via un **service** que l’utilisateur a mis en place (tunnel / reverse proxy / hosting).

Référence amont : le mécanisme **VS Code / Codespaces / Remote** (Ports view, auto-forward, public/private, URI detection dans le terminal).

## 1. Périmètre produit (brouillon)

| Cas | Attendu |
|-----|---------|
| Agent lance `npm run dev` / serveur local | Port détecté → accessible depuis l’IDE (preview / lien) |
| Utilisateur expose déjà un service | Brancher / documenter comment Drox s’y raccorde |
| Sécurité | Pas d’exposition publique par défaut ; opt-in clair |

## 2. Travaux prévus

1. **Recherche** : cartographier VS Code (`remote.portsAttributes`, forwarding provider, tunnel, simple browser).  
2. **Décision** : réutiliser / wrapper / réimplémenter mince côté Drox Agents + IDE.  
3. **MVP** : un flux dogfood (local OU service user) + doc courte.  
4. Hors scope initial : multi-tunnel cloud propriétaire, billing.

## 3. Done quand

- Note d’archi + choix technique figés.  
- Au moins **un** chemin fonctionnel (local ou service user) dogfoodable.  
- Surface Agents/IDE cohérente (lien / preview).

## 4. Suite

Ne pas démarrer avant la fin de la régulation **R11** (sauf spike lecture code VS Code non bloquant).
