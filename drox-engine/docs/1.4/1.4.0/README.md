# Drox 1.4.0 — Run Rail (conducteur linéaire)

**Statut** : **ouvert** — [OPENING](finalisation/OPENING-1.4.0.md) · branche git `1.4.0`  
**Prérequis** : [1.3.4 clôturée](../../1.3/1.3.4/finalisation/CLOSURE-1.3.4.md)  
**Suite** : [1.4.1 — index & graphe](../1.4.1/README.md)

---

## En une phrase

Refonte du **conducteur architecte** : rail linéaire à **stations consultatives** (`hold` / `advance`), **segments** de contexte isolés, **blocs UI repliables** — sans retour au `GateEngine` TOML.

---

## Arborescence documentation

```text
1.4.0/
├── README.md                 ← ce fichier
├── finalisation/
│   ├── OPENING-1.4.0.md
│   └── CLOSURE-1.4.0.md
├── 01-VISION.md
├── 02-RAIL-PROTOCOL.md
├── 03-STATIONS.md
├── 04-SEGMENTS.md
├── 05-CODE-ARCHITECTURE.md
├── 06-UI-BLOCKS.md
├── 07-IMPLEMENTATION-PHASES.md
├── 08-MIGRATION.md
├── 09-TEST-PLAN.md
├── 10-DECISIONS-PRODUIT.md
├── INVESTIGATION-file-edit.md
└── SMOKE-BACKLOG.md          ← bugs dogfood (post-Phase 4)
```

**Lecture recommandée** : `01` → `02` → `03` → `05` (avant tout PR code).

---

## Décision figée

Candidat de station proposé par le **moteur** (mode **A**). Mode **B** (saut déclaré) — reporté.

---

## Règle release

**Aucun code moteur** tant que docs `01`–`05` validées et Phase 0 ([07](07-IMPLEMENTATION-PHASES.md)) squelette seulement.

---

## Liens

- [Hub 1.4](../README.md)
- [CONDUCTEUR-CODE](../../1.3/1.3.2/CONDUCTEUR-CODE.md)
- [chat.txt dogfood](../../1.3/chat.txt)
