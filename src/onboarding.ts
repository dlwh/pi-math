import { readFile, lstat, mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { getAgentDir, withFileMutationQueue, VERSION } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { getPreset, PRESET_REVISION, type Preset } from "./presets.ts";
import { isLoopback, PiWorker, workerSettings, type WorkerContext } from "./adapter.ts";
import { Broker, throwIfAborted } from "./inference.ts";
import { ConfigSchema, ReviewSchema, type Config } from "./schema.ts";

function record(v: unknown, label: string): Record<string, unknown> {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(`${label} must be a JSON object; the existing file was not changed.`);
    return v as Record<string, unknown>;
}
/** Conflict detection deliberately preserves all unknown user-owned keys. */
function mergeRecord(old: Record<string, unknown>, patch: Record<string, unknown>, label: string): Record<string, unknown> {
    const result = structuredClone(old);
    for (const [key, value] of Object.entries(patch)) {
        if (Object.hasOwn(result, key) && !isDeepStrictEqual(result[key], value))
            throw new Error(`Existing ${label}.${key} conflicts with the preset. Review that entry manually; no file was changed.`);
        result[key] = structuredClone(value);
    }
    return result;
}
export function mergeProviders(existing: unknown, preset: Preset): Record<string, unknown> {
    const root = structuredClone(record(existing, "models.json"));
    const providers = { ...record(root.providers ?? {}, "providers") };
    for (const [id, incoming] of Object.entries(preset.providers)) {
        const old = record(providers[id] ?? {}, `providers.${id}`);
        const { models: incomingModels, ...patch } = incoming;
        const merged = mergeRecord(old, patch, `providers.${id}`);
        if (!Array.isArray(old.models ?? []) || !Array.isArray(incomingModels)) throw new Error("Provider models must be an array; no file was changed.");
        const models = (old.models ?? []) as unknown[];
        const next = models.map(v => structuredClone(record(v, "model entry")));
        const ids = next.map(v => v.id);
        if (ids.some(id => typeof id !== "string") || new Set(ids).size !== ids.length) throw new Error("Existing model IDs are invalid or duplicated; no file was changed.");
        for (const raw of incomingModels) {
            const model = record(raw, "preset model"), index = next.findIndex(m => m.id === model.id);
            // Existing modelOverrides would win over our model entry; never hide that conflict.
            const overrides = record(old.modelOverrides ?? {}, "modelOverrides");
            if (Object.hasOwn(overrides, String(model.id))) throw new Error(`Existing modelOverrides for ${id}/${model.id} need manual review; no file was changed.`);
            if (index === -1) next.push(structuredClone(model));
            else next[index] = mergeRecord(next[index]!, model, `model ${id}/${model.id}`);
        }
        providers[id] = { ...merged, models: next };
    }
    root.providers = providers;
    return root;
}
async function readModels(path: string): Promise<string | null> {
    try {
        const info = await lstat(path);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 2000000) throw new Error("models.json must be a regular file under 2 MB; no file was changed.");
        return await readFile(path, "utf8");
    } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw e;
    }
}
export interface SetupResult { preset: Preset; applied: boolean; changed: boolean; modelsPath: string; backupPath?: string; }
/** Preview is read-only. Applying never downloads weights, starts servers, or runs shell commands. */
export async function setupPreset(id: string, apply = false, agentDir = getAgentDir(), signal?: AbortSignal): Promise<SetupResult> {
    const preset = getPreset(id), path = join(agentDir, "models.json");
    throwIfAborted(signal);
    return withFileMutationQueue(path, async () => {
        const before = await readModels(path);
        let existing: unknown;
        try { existing = before === null ? {} : JSON.parse(before); }
        catch { throw new Error("models.json is not valid JSON. Repair it before setup; no file was changed."); }
        const next = mergeProviders(existing, preset), changed = !isDeepStrictEqual(next, existing);
        if (!apply || !changed) return { preset, applied: apply, changed, modelsPath: path };
        throwIfAborted(signal);
        await mkdir(agentDir, { recursive: true, mode: 0o700 });
        const lockPath = join(agentDir, ".pi-math-setup.lock");
        let lock;
        try { lock = await open(lockPath, "wx", 0o600); }
        catch { throw new Error("Another setup may be running. Wait, or inspect .pi-math-setup.lock before removing a stale lock."); }
        const temp = `${path}.${randomUUID()}.tmp`;
        let backupPath: string | undefined;
        try {
            if (await readModels(path) !== before) throw new Error("models.json changed during setup; retry after reviewing the newer file.");
            throwIfAborted(signal);
            if (before !== null) {
                backupPath = `${path}.pi-math-${Date.now()}-${randomUUID()}.bak`;
                await writeFile(backupPath, before, { flag: "wx", mode: 0o600 });
            }
            await writeFile(temp, JSON.stringify(next, null, 2) + "\n", { flag: "wx", mode: 0o600 });
            throwIfAborted(signal);
            if (await readModels(path) !== before) throw new Error("models.json changed during setup; refusing to replace it.");
            await rename(temp, path);
            return { preset, applied: true, changed: true, modelsPath: path, ...(backupPath ? { backupPath } : {}) };
        } finally {
            await unlink(temp).catch(() => {});
            await lock.close(); await unlink(lockPath);
        }
    });
}
export function setupMessage(r: SetupResult): string {
    const p = r.preset;
    return `${r.applied ? "Applied" : "Preview"}: ${p.title}\n${p.description}\n${p.memory}\nValidation: ${p.validation}\nPreset revision: ${PRESET_REVISION}\nPi provider file: ${r.modelsPath}\nWorkers: ${p.model.provider}/${p.model.id}\nLimits: ${p.settings.inference.maxCalls} calls, ${p.settings.inference.maxReservedOutputTokens} reserved output tokens per invocation; ${p.settings.inference.concurrency} at once.\n${r.backupPath ? `Backup: ${r.backupPath}\n` : ""}`
        + (r.applied ? "Worker settings are saved in this Pi session. Open /model and select the same model for ordinary conversation; then run /math doctor."
            : `No changes made. Applying replaces this session's inference settings (including role overrides), while retaining discovery/Lean settings and unrelated Pi entries.\nApply with: /math setup ${p.id} --apply`);
}
export interface Check { level: "ok" | "warning" | "error"; message: string; }
export interface DoctorReport { ok: boolean; checks: Check[]; parent: string | null; workers: { role: string; model: string; reasoning: string | number; context: number | null; maxOutputTokens: number }[]; }
const ROLES = ["curator", ...["explore", "gate", "decompose", "section", "verify", "revise"].flatMap(s => ["generate", "critic", "synthesize"].map(r => `${s}/${r}`)), ...["controller", "feature", "scaffold", "skeptic"].map(r => `discovery/${r}`)];
export function doctor(ctx: WorkerContext, config: Config): DoctorReport {
    const checks: Check[] = [], workers: DoctorReport["workers"] = [];
    const [major, minor] = process.versions.node.split(".").map(Number);
    checks.push({ level: major! > 22 || major === 22 && minor! >= 19 ? "ok" : "error", message: `Node ${process.versions.node}; requires 22.19 or later.` });
    checks.push({ level: VERSION === "0.85.1" ? "ok" : "warning", message: `Pi ${VERSION}; integration tested with 0.85.1. Other versions need compatibility validation.` });
    if (ctx.modelRegistry.getError()) checks.push({ level: "error", message: "Pi reports a model configuration error. Inspect models.json and use /model to reload it." });
    const roles = new Set([...ROLES, ...Object.keys(config.models), ...Object.keys(config.generation)]);
    for (const role of roles) {
        try {
            const s = workerSettings(ctx, config, role);
            workers.push({ role, model: `${s.model.provider}/${s.model.id}`, reasoning: s.reasoning, context: Number.isFinite(s.contextWindow) ? s.contextWindow : null, maxOutputTokens: s.maxOutputTokens });
            if (!ctx.modelRegistry.hasConfiguredAuth(s.model)) checks.push({ level: "error", message: `${s.model.provider}: no configured credential. Use Pi /login; local entries need a placeholder key.` });
            if (s.maxOutputTokens > config.maxReservedOutputTokens) checks.push({ level: "error", message: `${role}: one response exceeds the invocation's reserved-token budget.` });
        } catch (e) { checks.push({ level: "error", message: `${role}: ${e instanceof Error ? e.message : "Configuration error"}` }); }
    }
    const parent = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : null;
    if (config.localOnly && (!ctx.model || !isLoopback(ctx.model.baseUrl))) checks.push({ level: "warning", message: "Workers are local-only, but ordinary Pi conversation is not configured locally. Select the local model with /model before typing ordinary messages; /math commands run the workers directly." });
    if (config.localOnly && config.concurrency > 1) checks.push({ level: "warning", message: "Multiple local workers increase memory use and server queueing. Begin with concurrency 1." });
    checks.push({ level: "warning", message: "Offline checks cannot establish available RAM, the server's actual context/loaded weights, or mathematical quality. No inference was sent." });
    checks.push({ level: "ok", message: `The selected tree uses ${config.widths.reduce((a, b) => a + b, 0) * (1 + config.reviewers)} model calls per stage, plus curation and other stages. Budgets reset with each /math step or /math run.` });
    const unique = [...new Map(checks.map(c => [`${c.level}:${c.message}`, c])).values()];
    return { ok: !unique.some(c => c.level === "error"), checks: unique, parent, workers };
}
export function doctorMessage(r: DoctorReport): string {
    const groups = [...new Set(r.workers.map(w => `${w.model}; reasoning ${w.reasoning}; output cap ${w.maxOutputTokens}; declared context ${w.context ?? "unknown"}`))];
    return `${r.ok ? "Offline configuration checks passed." : "Setup needs attention."}\nParent Pi model: ${r.parent ?? "none selected"}\nWorkers:\n${groups.map(s => `  ${s}`).join("\n")}\n\n${r.checks.map(c => `${c.level.toUpperCase()}: ${c.message}`).join("\n")}\n\nOptional: /math doctor --probe sends two synthetic requests (at most 8,192 reserved output tokens). Hosted requests may incur charges. This checks communication and basic responses, not proof reliability.`;
}
export const PROBE_NOTICE = "Probe: two synthetic maths requests; at most 8,192 reserved output tokens. Hosted requests may be billed. No project proof is sent.";
export async function probe(ctx: WorkerContext, config: Config, signal?: AbortSignal) {
    const offline = doctor(ctx, config);
    if (!offline.ok) throw new Error("Fix the errors in /math doctor before sending a probe.");
    const generation = structuredClone(config.generation);
    for (const [key, g] of Object.entries(generation)) {
        const cap = Math.min(g.maxOutputTokens ?? config.maxOutputTokens, 4096);
        generation[key] = { ...g, maxOutputTokens: cap };
        if (g.thinkingBudget !== undefined) {
            const available = cap - (g.finalAnswerReserve ?? 1024);
            if (available < 128) throw new Error("Probe output cap cannot accommodate the configured thinking/final-answer split.");
            generation[key]!.thinkingBudget = Math.min(g.thinkingBudget, available);
        }
    }
    const cfg = ConfigSchema.parse({ ...config, generation, concurrency: 1, maxCalls: 2, maxOutputTokens: Math.min(config.maxOutputTokens, 4096), maxReservedOutputTokens: 8192, timeoutMs: Math.min(config.timeoutMs, 120000) });
    const records: unknown[] = [];
    const calls = new Broker(new PiWorker(ctx, cfg), cfg, async record => { records.push(record); }, signal);
    const sum = await calls.ask("section/generate", "Compute 2+2 and explain briefly.", {}, z.object({ answer: z.number(), explanation: z.string().min(1).max(2000) }).strict());
    if (sum.answer !== 4) throw new Error("The connection returned JSON but failed the arithmetic probe. Inspect the model/template before running research.");
    const review = await calls.ask("verify/critic", "Review the argument and report a concrete counterexample if false. Do not approve an incorrect universal claim.", { claim: "Every prime number is odd.", proof: "All prime numbers tested so far were odd.", inheritedObjections: [] }, ReviewSchema);
    if (review.verdict === "accept" || !review.issues.some(i => i.severity !== "minor"))
        throw new Error("The model failed the flawed-proof probe. It may be connected correctly but is not ready for this workflow.");
    return { ok: true, meaning: "Two synthetic checks passed; this is not a mathematical-quality benchmark or a parent-tool test.", usage: calls.usage, records };
}
