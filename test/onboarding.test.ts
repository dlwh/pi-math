import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, readdir, symlink, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { PRESETS, PRESET_REVISION, getPreset } from "../src/presets.ts";
import { doctor, doctorMessage, mergeProviders, setupMessage, setupPreset } from "../src/onboarding.ts";
import { SettingsSchema, emptyWorkbench, parseWorkbench } from "../src/workbench.ts";
import { ConfigSchema } from "../src/schema.ts";

async function temporary() { return mkdtemp(join(tmpdir(), "pi-math-setup-")); }
test("all presets load through published Pi and keep old settings/checkpoints readable", async () => {
    const dir = await temporary();
    try {
        for (const preset of PRESETS) {
            assert.deepEqual(SettingsSchema.parse(preset.settings), preset.settings);
            await writeFile(join(dir, "models.json"), JSON.stringify({ providers: preset.providers }));
            const runtime = await ModelRuntime.create({ modelsPath: join(dir, "models.json"), authPath: join(dir, "auth.json"), modelsStorePath: join(dir, "store.json"), allowModelNetwork: false });
            const registry = new ModelRegistry(runtime);
            assert.equal(registry.getError(), undefined, preset.id);
            const model = registry.find(preset.model.provider, preset.model.id);
            assert.ok(model, preset.id);
            const ctx = { model, modelRegistry: registry, scopedModels: [] };
            if (preset.where === "hosted") await runtime.setRuntimeApiKey(preset.model.provider, "fixture-placeholder");
            const report = doctor(ctx, preset.settings.inference);
            assert.equal(report.ok, true, JSON.stringify(report.checks));
            assert.ok(report.workers.every(w => w.model === `${preset.model.provider}/${preset.model.id}`));
            assert.doesNotMatch(doctorMessage(report), /fixture-placeholder|local-placeholder/);
        }
        const old = emptyWorkbench() as any;
        delete old.settings.inference.generation; delete old.settings.inference.localOnly;
        assert.deepEqual(parseWorkbench(old).settings.inference.generation, {});
        assert.equal(parseWorkbench(old).settings.inference.localOnly, false);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("setup previews without writing and applies idempotently with private backup", async () => {
    const dir = await temporary(), path = join(dir, "models.json");
    try {
        const original = { providers: { unrelated: { apiKey: "DO_NOT_DISPLAY", models: [{ id: "mine" }] } }, userNote: "preserved" };
        await writeFile(path, JSON.stringify(original));
        const preview = await setupPreset("local-ollama", false, dir);
        assert.equal(preview.applied, false);
        assert.deepEqual(JSON.parse(await readFile(path, "utf8")), original);
        assert.doesNotMatch(setupMessage(preview), /DO_NOT_DISPLAY/);
        const applied = await setupPreset("local-ollama", true, dir);
        assert.ok(applied.backupPath);
        assert.deepEqual(JSON.parse(await readFile(applied.backupPath, "utf8")), original);
        assert.equal((await stat(applied.backupPath)).mode & 0o777, 0o600);
        const actual = JSON.parse(await readFile(path, "utf8"));
        assert.deepEqual(actual.providers.unrelated, original.providers.unrelated);
        assert.equal(actual.userNote, "preserved");
        assert.equal((await stat(path)).mode & 0o777, 0o600);
        assert.equal((await setupPreset("local-ollama", true, dir)).changed, false);
        assert.equal((await readdir(dir)).filter(n => n.endsWith(".bak")).length, 1);
        await setupPreset("local-small", true, dir);
        assert.equal(JSON.parse(await readFile(path, "utf8")).providers["math-ollama"].models.length, 2);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("conflicts, malformed files, symlinks and cancellation preserve user files", async () => {
    const dir = await temporary(), path = join(dir, "models.json");
    try {
        await writeFile(path, "not json");
        await assert.rejects(setupPreset("local-ollama", true, dir), /not valid JSON/);
        assert.equal(await readFile(path, "utf8"), "not json");
        const existing = { providers: { "math-ollama": { baseUrl: "https://remote.invalid/v1" } } };
        await writeFile(path, JSON.stringify(existing));
        await assert.rejects(setupPreset("local-ollama", true, dir), /conflicts/);
        assert.deepEqual(JSON.parse(await readFile(path, "utf8")), existing);
        await assert.rejects(setupPreset("local-ollama", true, dir, AbortSignal.abort()), /cancelled/);
        await rm(path);
        await writeFile(join(dir, "target.json"), "{}");
        await symlink(join(dir, "target.json"), path);
        await assert.rejects(setupPreset("local-ollama", true, dir), /regular file/);
        assert.equal(await readFile(join(dir, "target.json"), "utf8"), "{}");
        const preset = getPreset("hosted-kimi");
        assert.throws(() => mergeProviders({ providers: { openrouter: { modelOverrides: { [preset.model.id]: { maxTokens: 100 } } } } }, preset), /modelOverrides/);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("local doctor checks every worker override and distinguishes the parent model", async () => {
    const dir = await temporary();
    try {
        const p = getPreset("local-ollama");
        await setupPreset(p.id, true, dir);
        const runtime = await ModelRuntime.create({ modelsPath: join(dir, "models.json"), authPath: join(dir, "auth.json"), modelsStorePath: join(dir, "store.json"), allowModelNetwork: false });
        const registry = new ModelRegistry(runtime);
        const parent = registry.find("openrouter", "moonshotai/kimi-k3")!;
        const ctx = { model: parent, modelRegistry: registry, scopedModels: [] };
        const report = doctor(ctx, p.settings.inference);
        assert.equal(report.ok, true);
        assert.ok(report.checks.some(c => /ordinary Pi conversation/.test(c.message)));
        const mixed = ConfigSchema.parse({ ...p.settings.inference, models: { ...p.settings.inference.models, "verify/critic": { provider: parent.provider, id: parent.id } } });
        assert.equal(doctor(ctx, mixed).ok, false);
        const local = registry.find(p.model.provider, p.model.id)!;
        assert.equal(doctor({ ...ctx, scopedModels: [{ model: parent }] }, p.settings.inference).ok, false);
        assert.equal(doctor({ ...ctx, model: local }, p.settings.inference).checks.some(c => /ordinary Pi conversation/.test(c.message)), false);
    } finally { await rm(dir, { recursive: true, force: true }); }
});

test("generated provider examples stay identical to the versioned catalog", async () => {
    const manifest = JSON.parse(await readFile(new URL("../examples/providers/manifest.json", import.meta.url), "utf8"));
    assert.deepEqual(manifest, { revision: PRESET_REVISION, presets: PRESETS.map(({ providers: _p, settings: _s, ...metadata }) => metadata) });
    for (const p of PRESETS) {
        assert.deepEqual(JSON.parse(await readFile(new URL(`../examples/providers/${p.id}.models.json`, import.meta.url), "utf8")), { providers: p.providers });
        assert.deepEqual(JSON.parse(await readFile(new URL(`../examples/providers/${p.id}.math.json`, import.meta.url), "utf8")), p.settings);
    }
});
