# Plan — Parité Agents (1.5.22)

**Parent** : [README 1.5.22](README.md)  
**Statut** : 📋 **cadrage** · **avant-dernier** avant la clôture docs  
**Ordre maj** : après Port forwarding · avant DOC (R12)

## 0. But

Rendre **accessibles côté fenêtre Agents** les capacités livrées surtout dans l’IDE principal pendant 1.5.21 / 1.5.22 — en particulier ce qui manque aujourd’hui.

Exemple concret : **gestion Embed / Codebase** (cockpit, inject, catalogue…) n’est **pas** accessible depuis Agents.

## 1. Inventaire (à compléter à l’impl)

| Capacité | IDE | Agents aujourd’hui | Cible |
|----------|-----|--------------------|--------|
| Embed / index Codebase (cockpit, inject, catalogue CB3b) | ✅ | ❌ / partiel | Accessible |
| Auto-régulation console (R3+) | sous Embed | ? | Au moins lecture ou lien |
| Autres livraisons 1.5.21–22 | — | — | Gap-list à figer |

## 2. Principes

1. **Même services** (`IDroxCodebase*`, regulation…) — pas de second moteur.  
2. UI Agents = **surface** (toolbar, panneau, commande) qui ouvre / pilote le même host.  
3. Pas de régression IDE ; Agents reste optionnel pour les features lourdes (cockpit complet peut être « open IDE view »).

## 3. Done quand

- Au minimum : **Embed / Codebase** utilisable depuis Agents (ouvre cockpit ou équivalent).  
- Liste des autres gaps 1.5.21–22 tranchée (fait / reporté / N/A).  
- Smoke dogfood Agents + IDE.

## 4. Suite

Après [PLAN-PORT-FORWARDING.md](PLAN-PORT-FORWARDING.md) · avant pass **DOC**.
