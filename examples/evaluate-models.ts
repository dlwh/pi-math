import { parseArgs } from "node:util";
import { mkdir, open, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { getPreset, PRESET_REVISION } from "../src/presets.ts";
import { evaluate, evaluationConfig, EVALUATION_TASKS, EVALUATION_REVISION } from "../src/evaluation.ts";
import { PiWorker } from "../src/adapter.ts";
import { doctor } from "../src/onboarding.ts";
import { SettingsSchema } from "../src/workbench.ts";
import { GenerationSchema } from "../src/schema.ts";

const { values } = parseArgs({ options: { preset: { type: "string" }, settings: { type: "string" }, live: { type: "boolean", default: false }, out: { type: "string" }, label: { type: "string" }, "max-output": { type: "string" }, effort: { type: "string" }, help: { type: "boolean" } } });
if (values.help) {
    console.log("npm run evaluate -- --preset <name> [--max-output 4096] [--effort medium] [--settings project.json]\nDry run by default: no registry/auth reads or model calls.\nTo send up to six requests, add --live --out <new.json> --label '<weights, quantization, runtime revision, hardware or hosted route>'.\nHosted runs may incur charges. Output-token limits are not a dollar cap. Use /math setup and doctor in Pi first.");
} else {
    const preset = getPreset(values.preset ?? "local-ollama");
    const effortValue = values.effort && /^\d+$/.test(values.effort) ? Number(values.effort) : values.effort;
    const generation = GenerationSchema.parse({ ...(values["max-output"] === undefined ? {} : { maxOutputTokens: Number(values["max-output"]) }), ...(effortValue === undefined ? {} : { reasoning: effortValue }) });
    let base = preset.settings.inference;
    if (values.settings) {
        if ((await stat(values.settings)).size > 2000000) throw new Error("Settings file exceeds 2 MB");
        base = SettingsSchema.parse(JSON.parse(await readFile(values.settings, "utf8"))).inference;
    }
    const cfg = evaluationConfig(base, generation.maxOutputTokens ?? 4096, generation.reasoning);
    const plan = { revision: EVALUATION_REVISION, preset: preset.id, presetRevision: PRESET_REVISION, tasks: EVALUATION_TASKS.map(t => ({ id: t.id, role: t.role })), maxCalls: cfg.maxCalls, maxReservedOutputTokens: cfg.maxReservedOutputTokens, outputPerCall: cfg.maxOutputTokens, concurrency: 1, config: cfg, live: values.live };
    console.log(JSON.stringify(plan, null, 2));
    if (!values.live) console.log("Dry run only. No files changed; no model requests sent.");
    else {
        if (!values.out || !values.label?.trim()) throw new Error("Live evaluation requires --out <new.json> and --label describing the actual weights/runtime/hardware or hosted route.");
        const runtime = await ModelRuntime.create({ allowModelNetwork: false });
        const registry = new ModelRegistry(runtime);
        const ctx = { model: registry.find(preset.model.provider, preset.model.id), modelRegistry: registry, scopedModels: [] };
        const diagnostics = doctor(ctx, cfg);
        if (!diagnostics.ok) throw new Error(diagnostics.checks.filter(c => c.level === "error").map(c => c.message).join("\n"));
        const destination = resolve(values.out);
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        const file = await open(destination, "wx", 0o600); // Refuse overwrite before making any paid call.
        const signal = new AbortController();
        const cancel = () => signal.abort();
        process.once("SIGINT", cancel);
        try {
            const save = async (report: unknown) => {
                const data = Buffer.from(JSON.stringify(report, null, 2) + "\n");
                await file.truncate(0);
                let position = 0;
                while (position < data.length) {
                    const { bytesWritten } = await file.write(data, position, data.length - position, position);
                    if (!bytesWritten) throw new Error("Could not write the evaluation record");
                    position += bytesWritten;
                }
                await file.sync();
            };
            await save({ ...plan, label: values.label, status: "starting; no results yet" });
            const report = await evaluate(new PiWorker(ctx, cfg), cfg, { mode: "live", label: values.label, signal: signal.signal, checkpoint: save });
            console.log(`Saved ${destination}. ${report.cases.length} cases; ${report.usage.calls} reserved calls. Read the outputs and fill human judgments in a separate review file.`);
            if (signal.signal.aborted || report.cases.some(c => c.status === "error" || c.exactWitness === false)) process.exitCode = 1;
        } finally { process.removeListener("SIGINT", cancel); await file.close(); }
    }
}
