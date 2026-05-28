import * as fs from "fs/promises";
import { getCourseCycleStore } from "./courseCycleStore";

/** Enregistre une écriture client si le suivi de cycle professeur est actif. */
export async function recordCourseFileMutation(
  workspace: string,
  tool: string,
  absPath: string,
  op: "create" | "modify",
): Promise<void> {
  const store = getCourseCycleStore();
  if (!store.isTracking()) {
    return;
  }
  try {
    await store.recordMutation(workspace, tool, absPath, op);
  } catch {
    /* ne bloque pas l'outil */
  }
}

/** Détermine create vs modify avant écriture. */
export async function fileOpKind(absPath: string): Promise<"create" | "modify"> {
  try {
    await fs.access(absPath);
    return "modify";
  } catch {
    return "create";
  }
}
