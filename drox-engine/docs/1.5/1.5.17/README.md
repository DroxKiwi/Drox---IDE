# 1.5.17 — Alignement enveloppe IDE sur le contrat TUI (plan / run)

**Statut** : **smoke** — file AMB prioritaire patchée ; smoke partiel (voir ci-dessous)  
**Version** : `droxVersion` **1.5.17**  
**Plan enveloppe** : [PLAN-1.5.17.md](PLAN-1.5.17.md)  
**Plan connexions LLM** : [PLAN-LLM-CONNECTIONS.md](PLAN-LLM-CONNECTIONS.md) — runtime OpenAI-compatible (même version)  
**Inventaire** : [AMBIGUITIES-IDE-TUI.md](AMBIGUITIES-IDE-TUI.md)  
**Fiches patch** : [amb/](amb/README.md)

## File prioritaire — statut

| AMB | Statut |
|-----|--------|
| [01](amb/AMB-01-plan-trois-verites.md) | fait (UI + note system) |
| [08](amb/AMB-08-propose-cancel-soft-success.md) | fait |
| [16](amb/AMB-16-triple-confirmation.md) | fait |
| [12](amb/AMB-12-loop-recovery-asymetrique.md) | fait |
| [05](amb/AMB-05-defaut-apply.md) | fait (labels) |
| [09](amb/AMB-09-phases-thinking-fold.md) / [18](amb/AMB-18-dual-surface.md) | fait |
| [03](amb/AMB-03-cancelled-todo-mapping.md) / [04](amb/AMB-04-vocabulaire-modes.md) | fait |

**File AMB 1.5.17 clôturée.** Connexions LLM : même **1.5.17**. Reste inventaire AMB reporté plus tard.

## Smoke manuel

### Connexions

Voir [PLAN-LLM-CONNECTIONS.md](PLAN-LLM-CONNECTIONS.md) — dispatch `provider` ; test list+chat ; adaptateurs séparés par id.

### AMB (résultat partiel — `docs/chat.txt`)

1. **Cancel write** → modèle voit échec, pas succès soft.
2. **imNotCrazy** + `confirmFileWrites` → une seule confirm.
3. **Loop abort** Agents → message friendly + Retry.
4. **Modes** : Propose / Applies lisibles.
5. **Plan** : clear UI + note system — **aide**, mais ne bloque pas la boucle *prose sans tool*.

**Constat smoke** : le modèle a édité plusieurs fichiers puis est retombé dans une boucle « je vais écrire la page TUI » + `[phase: acting]` **sans** `file_write` — typique **intent-only / FX-B** (1.5.16), pas AMB-08/16. Les patches enveloppe réduisent les mensonges outil / plan sticky ; ils ne forcent pas le modèle à émettre un tool call.

## Décision produit

**Accord** : UI → contrat TUI. Look Copilot conservé (AMB-09). Professor hors file (AMB-06).
