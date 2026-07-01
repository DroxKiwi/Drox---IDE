# Plan 1.5.12 — Post-natif (polish + P3)

**Version** : juin 2026  
**Base** : [1.5.11](../1.5.11/PLAN-1.5.11.md) livrée · OR `v1.5.11`  
**Branche** : `1.5.12` · tag cible **`v1.5.12`**

---

## En une phrase

Après bascule **natif nominal** (1.5.11), combler les écarts restants vs webview ([matrice](../1.5.11/COMPARE-WEBVIEW-VS-NATIF.md)), polish UX fil, et ouvrir **P3** (Changes / MCP).

---

## Périmètre

| **Dans ce plan** | **Hors scope / reporté** |
|------------------|---------------------------|
| Polish thinking / phases sink natif | Rebrand vert poussé (M3 reporté) |
| Refs `@` · diagnostic → natif · attachments | Réécriture moteur Rust (nominal) |
| Panneau Changes / Files (amorce P3) | |
| MCP UI + connexions ([#16](../../feature-brainstorm/16-connexions-mcp-ui-moteur.md)) | |
| *(optionnel)* suppression code webview legacy | |

---

## État d'avancement

| Pilier | Avancement |
|--------|------------|
| **P1** Polish sink natif | ouvert |
| **P2** Intégrations IDE | ouvert |
| **P3** Changes / MCP | ouvert |

---

## Critères d'acceptation (brouillon)

- [ ] Run E2E natif inchangé (régression 1.5.11)
- [ ] Au moins un item P1 ou P2 de la matrice COMPARE passé de partiel → fait
- [ ] Décision documentée : P3 Changes vs cartes Drox seules
- [ ] Bump `droxVersion` 1.5.12 + ship OR

---

## Liens

- [README 1.5.12](README.md)
- [CLOSURE 1.5.11](../1.5.11/CLOSURE-1.5.11.md)
