# Drox 1.5.0 — Remplacement moteur TUI → IDE

**Statut** : **clôturé (moteur)** — branche `1.5.0` · merge upstream documenté  
**Prérequis** : [1.4.2](../../1.4/1.4.2/README.md) tag `v1.4.2`  
**Décision** : remplacement moteur TUI + shim RPC moteur→IDE. **Vignettes composer** : Configuration + Architecte **conservées**.

---

## Avancement

| Phase | Statut |
|-------|--------|
| 0 Préparation | ✅ |
| 1 Remplacement moteur (`6b1a97b`) | ✅ |
| 2 Package / F5 | ✅ |
| 3 Shim RPC + vignettes LLM | ✅ |
| 4 Events shim + mapping phases | ✅ |
| 5 Dogfood / clôture | ✅ (sauf merge upstream 5.8–5.9) |

## Vignettes (décision produit)

| Vignette | Action |
|----------|--------|
| **Configuration** | ✅ Garder — serveur, clés, itérations |
| **Architecte** | ✅ Garder — modèle, contexte (`num_ctx`), sampling |
| Analyze / Trust edit / I'm not crazy | ✅ Garder — moteur mappe vers `PermissionMode` |
| Rôles orchestration 1.4 (executor…) | ❌ Absents du composer |

## En une phrase

Moteur TUI dans `drox-engine/drox`, shim JSON-RPC vers l’IDE existant. Dogfood **3 scénarios** validés sur `site-kdds` ([transcript](../../chat_qwen27b.txt)).

---

## Artefacts

| Doc | Rôle |
|-----|------|
| **[PLAN-1.5.0.md](PLAN-1.5.0.md)** | Étapes, checklist |
| **[CLOSURE-1.5.0.md](CLOSURE-1.5.0.md)** | Clôture chantier moteur |
| **[AUDIT-UPSTREAM-1.5.0.md](AUDIT-UPSTREAM-1.5.0.md)** | Écart VS Code · procédure merge |
| **[SHIM-MOTEUR-IDE.md](SHIM-MOTEUR-IDE.md)** | Mapping params + events |
| **[IMPACT-REMPLACEMENT.md](IMPACT-REMPLACEMENT.md)** | Ce qui meurt / arrive |

---

## Séquence 1.5

```text
1.5.0  Remplacement moteur TUI → drox.exe + IDE     ← CE CHANTIER (clôturé)
1.5.1  Routage / UI / signature (ex-1.4.3)         après ship 1.5.0
1.5.2  Index / graphe (ex-1.4.4)
1.5.3  Sampling par contexte (ex-1.4.5)
```

---

## Liens

- [Hub 1.5](../README.md)
- [TUI README](../../../drox/crates/drox-tui/README.md)
- [GUIDE publication](../../operations/GUIDE-PUBLICATION-WIN32.md)
