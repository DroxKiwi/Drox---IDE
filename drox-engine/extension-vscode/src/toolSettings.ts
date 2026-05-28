import * as vscode from "vscode";

/** Outil non désactivable (protocole / UX). */
export const DROX_ALWAYS_ACTIVE_TOOLS = [
  "ask_user_question",
  "todo_write",
] as const;

export type DroxAlwaysActiveTool = (typeof DROX_ALWAYS_ACTIVE_TOOLS)[number];

export interface DroxToolCatalogEntry {
  name: string;
  label: string;
  description: string;
}

export interface DroxToolGroup {
  id: string;
  label: string;
  tools: DroxToolCatalogEntry[];
}

/** Registre documenté pour les paramètres (§2.17). */
export const DROX_TOOL_GROUPS: DroxToolGroup[] = [
  {
    id: "files",
    label: "Fichiers & recherche",
    tools: [
      { name: "glob", label: "glob", description: "Recherche de fichiers par motif" },
      { name: "grep", label: "grep", description: "Recherche de texte dans le repo" },
      { name: "file_read", label: "file_read", description: "Lecture de fichiers" },
    ],
  },
  {
    id: "edit",
    label: "Édition",
    tools: [
      { name: "file_edit", label: "file_edit", description: "Modification par patch" },
      { name: "file_write", label: "file_write", description: "Écriture / création de fichier" },
      {
        name: "notebook_edit",
        label: "notebook_edit",
        description: "Édition de notebooks Jupyter",
      },
      { name: "delete_path", label: "delete_path", description: "Suppression de chemins" },
      { name: "copy_path", label: "copy_path", description: "Copie de fichiers / dossiers" },
    ],
  },
  {
    id: "exec",
    label: "Exécution",
    tools: [
      {
        name: "bash",
        label: "bash",
        description: "Commandes shell (très sensible — permissions)",
      },
    ],
  },
  {
    id: "ide",
    label: "IDE / analyse",
    tools: [
      { name: "lsp", label: "lsp", description: "Symboles, définitions, diagnostics LSP" },
    ],
  },
  {
    id: "web",
    label: "Web",
    tools: [
      { name: "web_search", label: "web_search", description: "Recherche web" },
      { name: "web_fetch", label: "web_fetch", description: "Récupération d’URL" },
    ],
  },
  {
    id: "plan",
    label: "Plan & interaction",
    tools: [
      {
        name: "exit_plan_mode",
        label: "exit_plan_mode",
        description: "Sortie du mode plan",
      },
    ],
  },
  {
    id: "memory",
    label: "Mémoire session",
    tools: [
      { name: "session_note", label: "session_note", description: "Note de session" },
      { name: "memory_read", label: "memory_read", description: "Lecture mémoire longue" },
      { name: "memory_list", label: "memory_list", description: "Liste des entrées mémoire" },
      {
        name: "session_compact",
        label: "session_compact",
        description: "Compaction du transcript (client IDE)",
      },
      {
        name: "session_search",
        label: "session_search",
        description: "Recherche dans la mémoire longue (client IDE)",
      },
    ],
  },
  {
    id: "skills",
    label: "Skills",
    tools: [
      { name: "skill_read", label: "skill_read", description: "Lire un skill local" },
      { name: "skill_list", label: "skill_list", description: "Lister les skills" },
    ],
  },
  {
    id: "git",
    label: "Git worktrees",
    tools: [
      {
        name: "git_worktree_enter",
        label: "git_worktree_enter",
        description: "Entrer dans un worktree isolé",
      },
      {
        name: "git_worktree_exit",
        label: "git_worktree_exit",
        description: "Quitter le worktree courant",
      },
    ],
  },
  {
    id: "professor",
    label: "Mode Professeur",
    tools: [
      {
        name: "course_plan_write",
        label: "course_plan_write",
        description: "Plan de cours (mode professor)",
      },
    ],
  },
];

/** Tous les noms d’outils exposés dans `drox.tools.disabled` (enum settings). */
export const DROX_TOGGLEABLE_TOOL_NAMES: string[] = DROX_TOOL_GROUPS.flatMap((g) =>
  g.tools.map((t) => t.name),
);

const ALWAYS_ACTIVE = new Set<string>(DROX_ALWAYS_ACTIVE_TOOLS);

export function isAlwaysActiveTool(name: string): boolean {
  return ALWAYS_ACTIVE.has(name);
}

/** `true` si l’outil peut être proposé au modèle / exécuté. */
export function isToolEnabled(name: string, scope?: vscode.Uri): boolean {
  if (isAlwaysActiveTool(name)) {
    return true;
  }
  const disabled = getDisabledToolNames(scope);
  return !disabled.has(name);
}

export function isMcpToolsEnabled(scope?: vscode.Uri): boolean {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  return cfg.get<boolean>("tools.mcp.enabled") !== false;
}

/** Sous-agents (`task`, §2.10) — désactivés par défaut. */
const DEFAULT_SUBAGENT_NUM_CTX = 8192;

function readDroxModelSetting(
  cfg: vscode.WorkspaceConfiguration,
  primary: string,
  legacy: string,
): string {
  const p = cfg.get<string>(primary);
  if (typeof p === "string" && p.trim()) {
    return p.trim();
  }
  const l = cfg.get<string>(legacy);
  return typeof l === "string" ? l.trim() : "";
}

export function getArchitectModel(scope?: vscode.Uri): string {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  return readDroxModelSetting(cfg, "architect.model", "model");
}

export function getExecutorModel(scope?: vscode.Uri): string {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  return readDroxModelSetting(cfg, "executor.model", "subagents.model");
}

export function getSubagentSettings(scope?: vscode.Uri): {
  enabled: boolean;
  maxIterations: number;
  maxConcurrent: number;
  model: string;
  numCtx: number;
} {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  const maxIterations = cfg.get<number>("subagents.maxIterations") ?? 15;
  const maxConcurrent = cfg.get<number>("subagents.maxConcurrent") ?? 1;
  const modelRaw = getExecutorModel(scope);
  const numCtxRaw = cfg.get<number>("subagents.numCtx") ?? DEFAULT_SUBAGENT_NUM_CTX;
  return {
    enabled: cfg.get<boolean>("subagents.enabled") === true,
    maxIterations: Math.min(50, Math.max(1, maxIterations)),
    maxConcurrent: Math.min(8, Math.max(1, maxConcurrent)),
    model: modelRaw,
    numCtx: Math.min(131_072, Math.max(2048, Math.floor(numCtxRaw))),
  };
}

/** Noms d’outils désactivés (hors toujours actifs). */
export function getDisabledToolNames(scope?: vscode.Uri): Set<string> {
  const cfg = vscode.workspace.getConfiguration("drox", scope);
  const raw = cfg.get<string[]>("tools.disabled") ?? [];
  const out = new Set<string>();
  for (const name of raw) {
    if (typeof name !== "string" || !name.trim()) {
      continue;
    }
    const n = name.trim();
    if (isAlwaysActiveTool(n)) {
      continue;
    }
    if (DROX_TOGGLEABLE_TOOL_NAMES.includes(n)) {
      out.add(n);
    }
  }
  return out;
}

/** Liste pour `agent.run` (camelCase JSON-RPC). */
export function getDisabledToolsForRun(scope?: vscode.Uri): string[] {
  return [...getDisabledToolNames(scope)].sort();
}

/** Description markdown pour la page Paramètres (groupes). */
export function formatToolGroupsForSettingsDescription(): string {
  const lines = [
    "Outils **désactivés** pour ce workspace : le modèle ne reçoit pas leur schéma.",
    "",
    "**Toujours actifs** (non listables) : `ask_user_question`, `todo_write`.",
    "",
    "**Groupes** :",
  ];
  for (const g of DROX_TOOL_GROUPS) {
    lines.push(`- **${g.label}** : ${g.tools.map((t) => `\`${t.name}\``).join(", ")}`);
  }
  lines.push(
    "",
    "Les outils MCP dynamiques (`mcp__…`) se contrôlent via `drox.tools.mcp.enabled`.",
  );
  return lines.join("\n");
}
