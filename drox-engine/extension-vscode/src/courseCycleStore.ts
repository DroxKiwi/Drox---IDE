import * as fs from "fs/promises";
import * as path from "path";

export interface CourseCycleMeta {
  cycleId: string;
  startedAt: string;
  courseTitle?: string;
}

export interface JournalEntry {
  seq: number;
  tool: string;
  path: string;
  op: "create" | "modify" | "delete";
}

/**
 * Journal des mutations pendant un cycle **mode Professeur** (M3).
 * Stockage : `.drox/course-cycles/<cycleId>/` (baseline + journal.jsonl).
 */
export class CourseCycleStore {
  private activeCycleId: string | null = null;
  private trackingEnabled = false;

  setTrackingEnabled(enabled: boolean): void {
    this.trackingEnabled = enabled;
    if (!enabled) {
      this.activeCycleId = null;
    }
  }

  isTracking(): boolean {
    return this.trackingEnabled;
  }

  getActiveCycleId(): string | null {
    return this.activeCycleId;
  }

  private cyclesRoot(workspaceRoot: string): string {
    return path.join(workspaceRoot, ".drox", "course-cycles");
  }

  private cycleDir(workspaceRoot: string, cycleId: string): string {
    return path.join(this.cyclesRoot(workspaceRoot), cycleId);
  }

  async ensureCycle(
    workspaceRoot: string,
    courseTitle?: string,
  ): Promise<string> {
    if (this.activeCycleId) {
      return this.activeCycleId;
    }
    const cycleId = `cyc_${new Date().toISOString().replace(/[:.]/g, "-")}`;
    const dir = this.cycleDir(workspaceRoot, cycleId);
    await fs.mkdir(path.join(dir, "baseline"), { recursive: true });
    const meta: CourseCycleMeta = {
      cycleId,
      startedAt: new Date().toISOString(),
      courseTitle,
    };
    await fs.writeFile(
      path.join(dir, "meta.json"),
      JSON.stringify(meta, null, 2),
      "utf8",
    );
    await fs.writeFile(path.join(dir, "journal.jsonl"), "", "utf8");
    this.activeCycleId = cycleId;
    return cycleId;
  }

  endCycle(): void {
    this.activeCycleId = null;
  }

  private baselineFile(
    workspaceRoot: string,
    cycleId: string,
    absPath: string,
  ): string {
    const rel = path.relative(workspaceRoot, absPath).replace(/\\/g, "/");
    return path.join(this.cycleDir(workspaceRoot, cycleId), "baseline", rel);
  }

  private async ensureBaseline(
    workspaceRoot: string,
    cycleId: string,
    absPath: string,
  ): Promise<void> {
    const dest = this.baselineFile(workspaceRoot, cycleId, absPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fs.access(dest);
      return;
    } catch {
      /* pas encore de baseline */
    }
    try {
      await fs.copyFile(absPath, dest);
    } catch {
      /* fichier inexistant (création) */
    }
  }

  /**
   * Enregistre une mutation réelle sur disque (client tools).
   */
  async recordMutation(
    workspaceRoot: string,
    tool: string,
    absPath: string,
    op: JournalEntry["op"],
  ): Promise<void> {
    if (!this.trackingEnabled) {
      return;
    }
    const cycleId = await this.ensureCycle(workspaceRoot);
    const journalPath = path.join(
      this.cycleDir(workspaceRoot, cycleId),
      "journal.jsonl",
    );
    let seq = 1;
    try {
      const raw = await fs.readFile(journalPath, "utf8");
      const lines = raw.trim().split("\n").filter(Boolean);
      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]!) as JournalEntry;
        seq = last.seq + 1;
      }
    } catch {
      /* journal vide */
    }

    if (op === "modify" || op === "delete") {
      await this.ensureBaseline(workspaceRoot, cycleId, absPath);
    }

    const entry: JournalEntry = { seq, tool, path: absPath, op };
    await fs.appendFile(journalPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  async undoCycle(
    workspaceRoot: string,
  ): Promise<{ restored: number; removed: number; cycleId: string | null }> {
    const cycleId = this.activeCycleId;
    if (!cycleId) {
      return { restored: 0, removed: 0, cycleId: null };
    }
    const journalPath = path.join(
      this.cycleDir(workspaceRoot, cycleId),
      "journal.jsonl",
    );
    let raw = "";
    try {
      raw = await fs.readFile(journalPath, "utf8");
    } catch {
      this.endCycle();
      return { restored: 0, removed: 0, cycleId };
    }

    const entries: JournalEntry[] = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as JournalEntry)
      .sort((a, b) => b.seq - a.seq);

    let restored = 0;
    let removed = 0;
    for (const e of entries) {
      const baseline = this.baselineFile(workspaceRoot, cycleId, e.path);
      try {
        if (e.op === "create") {
          await fs.unlink(e.path);
          removed += 1;
        } else if (e.op === "delete") {
          await fs.mkdir(path.dirname(e.path), { recursive: true });
          await fs.copyFile(baseline, e.path);
          restored += 1;
        } else if (e.op === "modify") {
          await fs.mkdir(path.dirname(e.path), { recursive: true });
          await fs.copyFile(baseline, e.path);
          restored += 1;
        }
      } catch {
        /* entrée partielle ignorée */
      }
    }
    this.endCycle();
    return { restored, removed, cycleId };
  }
}

let singleton: CourseCycleStore | null = null;

export function getCourseCycleStore(): CourseCycleStore {
  if (!singleton) {
    singleton = new CourseCycleStore();
  }
  return singleton;
}
