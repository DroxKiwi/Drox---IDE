/** Taille max des JSON affichés dans le webview (caractères). */
const MAX_JSON_CHARS = 1800;

export function previewJson(value: unknown, max = MAX_JSON_CHARS): string {
  try {
    const s = JSON.stringify(value, null, 2);
    if (s.length <= max) {
      return s;
    }
    return `${s.slice(0, max)}…`;
  } catch {
    return String(value);
  }
}

function shortString(s: string, max = 80): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/**
 * Construit un libellé court et lisible pour un appel d'outil.
 *
 * Renvoie un couple `{ verb, target }` (ex. `{ verb: "Read", target: "src/foo.ts" }`).
 * `target` est facultatif (peut être vide quand le tool n'a pas d'argument
 * intéressant à exposer).
 */
export function describeToolCall(
  name: string,
  args: unknown,
): { verb: string; target: string } {
  const a = (args && typeof args === "object" ? args : {}) as Record<
    string,
    unknown
  >;

  const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

  switch (name) {
    case "file_read": {
      const p = shortString(asStr(a.path));
      const s = a.start_line;
      const e = a.end_line;
      const range =
        typeof s === "number" &&
        typeof e === "number" &&
        Number.isFinite(s) &&
        Number.isFinite(e)
          ? ` L${s}–${e}`
          : "";
      return { verb: "Read", target: p ? `${p}${range}` : range.trim() || p };
    }
    case "file_write":
      return { verb: "Wrote", target: shortString(asStr(a.path)) };
    case "delete_path":
      return { verb: "Deleted", target: shortString(asStr(a.path)) };
    case "copy_path":
      return {
        verb: "Copied",
        target: `${shortString(asStr(a.source))} → ${shortString(asStr(a.destination))}`,
      };
    case "notebook_edit": {
      const nbPath = asStr(a.path) || asStr(a.file_path);
      return { verb: "Edited notebook", target: shortString(nbPath) };
    }
    case "grep": {
      const pat = shortString(asStr(a.pattern));
      const where = asStr(a.path);
      const gl = asStr(a.glob);
      const scope = gl ? (where ? `${where} (${gl})` : gl) : where;
      return {
        verb: "Searched",
        target: scope ? `${pat} in ${scope}` : pat,
      };
    }
    case "glob":
      return { verb: "Listed", target: shortString(asStr(a.pattern)) };
    case "bash":
      return { verb: "Ran", target: shortString(asStr(a.command), 100) };
    case "web_fetch":
      return { verb: "Fetched", target: shortString(asStr(a.url)) };
    case "web_search":
      return { verb: "Searched web", target: shortString(asStr(a.query)) };
    case "lsp": {
      const op = asStr(a.op) || "?";
      switch (op) {
        case "diagnostics": {
          const where = asStr(a.path);
          return {
            verb: "LSP diagnostics",
            target: where ? shortString(where) : "(workspace)",
          };
        }
        case "workspace_symbol":
          return {
            verb: "LSP search symbol",
            target: shortString(asStr(a.query) || asStr(a.symbol)),
          };
        case "definition":
        case "references":
        case "hover": {
          const sym = asStr(a.symbol);
          const where = asStr(a.path);
          const pos = a.position as
            | { line?: number; character?: number }
            | undefined;
          const at =
            sym ||
            (pos && typeof pos.line === "number"
              ? `${where}:${pos.line + 1}:${(pos.character ?? 0) + 1}`
              : where);
          return {
            verb: `LSP ${op}`,
            target: shortString(at),
          };
        }
        default:
          return { verb: "LSP", target: op };
      }
    }
    case "ask_user_question":
      return { verb: "Asked", target: shortString(asStr(a.prompt)) };
    case "exit_plan_mode":
      return { verb: "Exited plan mode", target: "" };
    case "todo_write": {
      const todos = Array.isArray(a.todos) ? a.todos : [];
      return {
        verb: "Updated plan",
        target: `${todos.length} todo${todos.length > 1 ? "s" : ""}`,
      };
    }
    case "course_plan_write": {
      const steps = Array.isArray(a.steps) ? a.steps : [];
      const title =
        typeof a.courseTitle === "string"
          ? a.courseTitle
          : typeof a.course_title === "string"
            ? a.course_title
            : "";
      return {
        verb: "Plan de cours",
        target: title
          ? `${title} (${steps.length} étape${steps.length > 1 ? "s" : ""})`
          : `${steps.length} étape${steps.length > 1 ? "s" : ""}`,
      };
    }
    default:
      return { verb: "Ran", target: name };
  }
}
