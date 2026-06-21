# Drox 1.5.1b — Release Linux

**Statut** : **livré** avec 1.5.1 (juin 2026)  
**Prérequis** : [1.5.1](../1.5.1/CLOSURE-1.5.1.md) · même tag **`v1.5.1`** sur `Drox---IDE---OR`

---

## En une phrase

Distribuer **Drox IDE** sur Linux (`.deb` amd64) via le même repo `Drox---IDE---OR` et le même `latest.json` que Windows — sans retarder le tag **1.5.1** côté sources.

---

## Séquence release 1.5.1 + 1.5.1b

```text
1.5.1 sources (branche 1.5.1) — smoke F5 VERT
    → tag v1.5.1 + drox:ship Windows (win32-x64)
    → CI Linux (1.5.1b) — build .deb + merge manifest linux-x64
    → gh release v1.5.1 (setup.exe + .deb)
```

---

## Docs

- [PLAN-1.5.1b.md](PLAN-1.5.1b.md) — checklist chantier
- [GUIDE publication Linux](../../operations/GUIDE-PUBLICATION-LINUX.md)

---

## Liens

- [Hub 1.5](../README.md)
- [GUIDE publication Windows](../../operations/GUIDE-PUBLICATION-WIN32.md)
