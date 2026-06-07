# Patch notes 1.3.2

**Version** : `droxVersion` **1.3.2** · branche `1.3.2`  
**Statut** : stabilisation — tests avant tag

**Suivi** : [JOURNAL-1.3.2.md](JOURNAL-1.3.2.md) · [CLOSURE-1.3.2.md](finalisation/CLOSURE-1.3.2.md) · [TEST-PLAN](finalisation/TEST-PLAN-1.3.2.md)

---

## Résumé

La 1.3.2 **retire le bruit** du moteur (gate chain TOML, paliers `E-*`, backpack, tours `architect_intent`) et livre un flux **simple et testable** : architecte + prompts + tool gates + sub-agents.

Les anciens « 3 piliers » produit (sessions segmentées, dé-brand, gate discussion avancée…) et les features contexte/latence → **[1.3.5](../1.3.5/README.md)**.

---

## Livré

### Moteur simplifié

| Changement | Détail |
|------------|--------|
| Routage | RPC `architectInteractionMode` → discuss / analyze / edit ; défaut **edit** |
| Supprimé | `GateEngine`, `EditTier`, backpack, `architect_intent`, events `GateProbe` |
| Prompt edit | `01_core.md` + tous les `T-*` au boot ; choix du **modèle** (plus de palier moteur) |
| Conservé | Tool gates (`architect_gates.rs`, `gates.rs`), `delegate_executor` |
| Pipeline | `orchestrationPipeline: "role_split"` (plus `role_split+gate_toml`) |
| Nettoyage | `context_bubble`, registry `E-*`, UI `gateDev` / `gateTags` |

**Référence** : [CONDUCTEUR-CODE.md](CONDUCTEUR-CODE.md)

### Qualité orchestration (hérité 1.3.2 début)

- **Executor « Same as Architect »** : même modèle + paramètres LLM Ollama ; seul **Concurrent** modifiable côté exécuteur.

### Documentation

- Carte code actuelle : CONDUCTEUR-CODE
- Archive plans gates/backpack : [gates/ARCHIVE.md](gates/ARCHIVE.md)
- Plan 1.3.5 (index, graphe, fast path) : [PLAN-1.3.5.md](../1.3.5/PLAN-1.3.5.md)

---

## À valider avant tag

Exécuter [TEST-PLAN-1.3.2.md](finalisation/TEST-PLAN-1.3.2.md) :

- T1 « Salut » → **aucun** step `GATE · probe` dans l’export
- Discuss / edit / tool gates / delegate selon scénarios T2–T10
- `cargo test -p drox-engine` vert
- IDE → `target/debug/drox.exe` rebuild + Reload Window

---

## Reporté (hors 1.3.2)

| Sujet | Destination |
|-------|-------------|
| Index / RAG local, graphe contexte, fast path | [1.3.5](../1.3.5/README.md) |
| Sessions segmentées | 1.3.3+ ou IDE |
| Dé-branding + licences | release produit / 1.3.1 |
| Retrait UI Exploring | IDE |
| Notifs fin de cycle (B-01) | IDE — non bloquant moteur |
| Paramètres `engineStrictness` / paliers | Annulé |

---

## Liens

- [README 1.3.2](README.md)
- [Hub 1.3](../README.md)
- [GUIDE-PUBLICATION-WIN32](../../operations/GUIDE-PUBLICATION-WIN32.md)
