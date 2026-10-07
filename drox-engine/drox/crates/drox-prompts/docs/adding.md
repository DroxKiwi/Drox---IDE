# Ajouter / modifier une fiche prompt

Garde-fou pour ne pas rerégénérer de dose toxique. Complète [`injection-map.md`](injection-map.md) et [`journal.md`](journal.md) si l’injection change.

## Checklist avant d’écrire du body

1. **Quelle couche ?**
   - **1 Contrat** — `session.core`, `tools.*` (stable, rare)
   - **2 Contexte run** — `session.*` (flag run : Explore, hors-WS, professeur, thinking)
   - **3 Situation** — `runtime.*` / `gates.*` / `blocks.*` (un motif, un `when`)

2. **Claim déjà couvert ?**  
   Cherche dans le catalogue la même clé (`plan_assign_merge`, `docs_tree.*`, …).  
   Si la valeur est déjà la bonne → **pas** de nouveau paragraphe protocole : delta situationnel seulement, ou pointeur vers la fiche canonique.

3. **Canon Plan→Assign→Merge**  
   Une seule source détaillée : `session.subagents.explore` (quand Explore on).  
   CORE / frames turn-0 / rescues = pointeur ou delta, pas un second playbook.

4. **`when` mécanique**  
   Condition réelle (flag, phase, seuil, gate) — pas d’heuristique NL.  
   Ex. : `phase_acting_without_tool_calls`, `work_plan_frame`, `explore_enabled+…`.

5. **Canal**  
   - Blob system (A) vs message runtime (B) vs tool schema (C) vs ask one-shot (D) vs Explore enfant (E).  
   Documente le site (`handlers`, `drive.rs`, …).

6. **Test mental dose**  
   Dans le pire scénario turn-0 (work + Explore + doc), le modèle lit-il cette idée **deux fois** ? Si oui → fusionne ou pointe.

7. **Strength**
   - `Prefer` — guidance soft (tools libres)
   - `MustText` — formulation MUST / STOP dans le texte (gate soft ou refus `blocks`)  
   Pas de troisième niveau : tout « soft » produit = `Prefer`.

8. **Après merge code**
   - fiche dans `catalog.rs` (+ claims lint)
   - `injection-map.md` si scénario / ordre change
   - entrée datée dans `journal.md`

## Où mettre le body

| Besoin | Module |
|--------|--------|
| Protocole phases / tools parent | `core.rs` |
| Supplement flag run | `session.rs` |
| Frame / rescue boucle soft | `runtime.rs` |
| Filet done / loop / intent-write | `gates.rs` |
| Refus hard-gate (texte d’erreur modèle) | `blocks.rs` |
| Description outil | `tools.rs` |
| Explore enfant | `explore.rs` |
| Ask boot hors transcript | `model_questions.rs` |
| Compaction | `compaction.rs` |

## Interdits rapides

- Needles NL FR/EN pour décider d’injecter (RULES §6)
- Dupliquer Plan→Assign→Merge hors `session.subagents.explore`
- Ask IDE pour ce que le moteur classifie déjà (`model_question.session.user_intent`)
- Fiche catalogue sans site d’injection réel (orphelin)
