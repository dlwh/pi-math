import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, link, unlink, lstat, realpath } from "node:fs/promises";
import { resolve, join } from "node:path";
import { StateSchema, type ResearchState } from "./schema.ts";

export function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export interface CheckpointRef { version: 1; hash: string; runId: string }
export interface BranchEntry { type: string; customType?: string; data?: unknown }
export const CHECKPOINT_TYPE = "pi-math/checkpoint-v1";

/** No mutable "latest" pointer: Pi's current branch is the authority. */
export class ObjectStore {
  readonly root: string;
  constructor(readonly cwd: string) { this.root = join(resolve(cwd), ".pi", "math"); }
  async initialize(): Promise<void> {
    for (const path of [join(resolve(this.cwd), ".pi"), this.root, join(this.root, "objects")]) {
      await mkdir(path, { recursive: true });
      if ((await lstat(path)).isSymbolicLink()) throw new Error("Research storage cannot use a symlink");
    }
    const actual = await realpath(this.root), base = await realpath(this.cwd);
    if (!actual.startsWith(base + "/") && !actual.startsWith(base + "\\")) throw new Error("Research storage escaped the project");
  }
  async put(value: unknown): Promise<string> {
    await this.initialize();
    const text = JSON.stringify(value), key = hash(value);
    const dest = join(this.root, "objects", `${key}.json`);
    const tmp = join(this.root, "objects", `${key}.${randomUUID()}.tmp`);
    const file = await open(tmp, "wx", 0o600);
    try { await file.writeFile(text); await file.sync(); } finally { await file.close(); }
    try {
      await link(tmp, dest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      await this.get(key); // Existing content must really match its address.
    } finally { await unlink(tmp); }
    return key;
  }
  async get(key: string): Promise<unknown> {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid object address");
    await this.initialize();
    const file = join(this.root, "objects", `${key}.json`);
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) throw new Error("Research object cannot be a symlink");
    if (stat.size > 32_000_000) throw new Error("Research object exceeds size limit");
    const text = await readFile(file, "utf8");
    if (text.length > 32_000_000) throw new Error("Research object exceeds size limit");
    const value: unknown = JSON.parse(text);
    if (hash(value) !== key) throw new Error("Corrupt research object: hash mismatch");
    return value;
  }
  async checkpoint(state: ResearchState): Promise<CheckpointRef> {
    StateSchema.parse(state);
    return { version: 1, hash: await this.put(state), runId: state.id };
  }
  async restore(entries: readonly BranchEntry[]): Promise<ResearchState | null> {
    const entry = [...entries].reverse().find(e => e.type === "custom" && e.customType === CHECKPOINT_TYPE);
    if (!entry) return null;
    const ref = entry.data as Partial<CheckpointRef> | undefined;
    if (ref?.version !== 1 || typeof ref.hash !== "string") throw new Error("Unsupported research checkpoint");
    const state = StateSchema.parse(await this.get(ref.hash));
    if (state.id !== ref.runId) throw new Error("Checkpoint run mismatch");
    return state;
  }
}
