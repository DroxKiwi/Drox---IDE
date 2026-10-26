# Drox Motion

**État : dormant** — l’import dans `drox.contribution.ts` est commenté ; rien ne s’exécute au runtime.

Animations are isolated from the rest of the workbench. Integration is a single import from `drox.contribution.ts`.

## Surfaces

| Surface | Scope | Status |
|---------|--------|--------|
| **IDE** | Main Drox window, code editor | Editor reveal on first open (`drox.motion.ide.editorReveal.enabled`) |
| **Agent** | Sessions / Agents window (`isSessionsWindow`) | Reserved — no IDE effects run there |

## Layout

```
motion/
  droxMotion.contribution.ts    # entry: config + IDE contributions
  droxMotionConfiguration.ts
  droxMotionSurface.ts
  ide/
    droxIdeMotionGate.ts
    droxIdeEditorRevealContribution.ts
    editorReveal/
      droxIdeEditorRevealEffect.ts   # canvas + rAF only
      droxIdeEditorRevealMatrix.ts   # discrete binary rain (Matrix-lite)
      droxIdeEditorReveal.css
```

Future Agent motion should live under `motion/agent/` and register from the same contribution file.
