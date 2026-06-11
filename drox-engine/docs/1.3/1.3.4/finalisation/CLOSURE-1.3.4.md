# Clôture 1.3.4 — architecte seul

**Version** : `droxVersion` **1.3.4**  
**Statut** : **clôturée anticipément** (juin 2026)  
**Branche** : `1.3.4` — figée ; suite sur **`1.4.0`**

---

## Motif de clôture anticipée

Le chantier **stabilisation solo** (Phase S/U) est interrompu au profit de la refonte conducteur **[1.4.0 Run Rail](../../../1.4/archive/1.4.0/README.md)** (désormais **archivé / pause** — juin 2026). Le dogfood ([chat_qwen27b.txt](../../chat_qwen27b.txt) et transcripts associés) a démontré que des patches incrémentaux (Phase H) ne suffisent pas : il faut un rail linéaire + segments.

---

## Livré (conservé sur `1.3.4` / base `1.4.0`)

| # | Livrable | Statut |
|---|----------|--------|
| **R1** | `executor_delegation_enabled: false` par défaut | ✅ |
| **R2** | Prompts solo + `delegate_executor` masqué — [RELIQUATS](../RELIQUATS-ARCHITECTE-SEUL.md) | ✅ |
| **R3** | `cargo test -p drox-engine` vert (dernière campagne) | ✅ |
| **R8** | Code exécuteur conservé, réactivation `custom` documentée | ✅ |

---

## Non livré (reporté)

| # | Livrable | Report |
|---|----------|--------|
| **R4** | `cargo test -p drox-cli` signé release | 1.4.0 |
| **R5** | TEST-PLAN solo signé | Remplacé par [09-TEST-PLAN](../../../1.4/archive/1.4.0/09-TEST-PLAN.md) |
| **R6–R7** | Binaire frais + modes permission campagne complète | 1.4.0 |
| **R9** | Phase H durcissement | Absorbé par run rail |
| **U1–U2** | UI polish | 1.4.0 (blocs repliables) |

---

## Hors scope (renuméroté)

- Index / graphe / fast path : **[1.4.3](../../../1.4/1.4.3/README.md)** (ex-1.3.5)

---

## Liens

- [README 1.3.4](../README.md)
- [PLAN](../PLAN-1.3.4.md)
- [OPENING 1.4.0](../../../1.4/archive/1.4.0/finalisation/OPENING-1.4.0.md)
- [Hub 1.4](../../../1.4/README.md)
