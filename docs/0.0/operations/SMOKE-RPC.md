# Smoke RPC Drox (manuel / CI avec binaire)

Scénario cible I-38 : **prompt → tool (lecture) → done**.

## Prérequis

- `drox` compilé : `cd drox-engine/drox && cargo build -p drox-cli`
- Ollama (ou autre backend) accessible si vous lancez un vrai `agent.run`
- Workspace de test ouvert

## Tests automatisés fork (sans LLM)

```powershell
# Depuis la racine Nexus-IDE---VsCode
npm run compile
.\scripts\test-drox.ps1
```

Couvre : parsing `file_edit` / `notebook_edit`, mutations fichier, complétion `@`, diagnostics, permissions ask, registre `tool/exec`, pont webview.

## Smoke RPC minimal (CLI)

```powershell
cd drox-engine\drox
cargo run -p drox-cli -- serve
# Autre terminal : requête initialize + agent.run (JSON-RPC NDJSON sur stdin)
```

## Binaire release (I-39)

```powershell
npm run package-drox
# Puis package IDE : gulp vscode-win32-x64 (ou équivalent)
```

Voir `resources/drox/README.md`.

Pour une validation E2E complète avec LLM, utiliser l’IDE (panneau Drox) une fois le binaire embarqué ou `drox` sur le PATH.
