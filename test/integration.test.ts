import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Check } from "typebox/value";
import { discoverAndLoadExtensions, type ExtensionContext, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Context } from "@earendil-works/pi-ai";
import { ConfigSchema } from "../src/schema.ts";
import { PiWorker } from "../src/adapter.ts";
import { ObjectStore, type BranchEntry } from "../src/store.ts";
import { emptyWorkbench, restoreWorkbench, WORKBENCH_TYPE, parseWorkbench } from "../src/workbench.ts";
import { newResearch } from "../src/proof.ts";
import { newDiscovery, parseDataset, DiscoveryEngine } from "../src/discovery.ts";
import { HeuristicPolicy } from "../src/policies.ts";
import { AlgebraProver } from "../src/certificate.ts";
import { exportWorkbench } from "../src/export.ts";
import { readProjectJson } from "../src/extension.ts";
async function harness() {
    const cwd = await mkdtemp(join(tmpdir(), "pi-math-pi-"));
    const loaded = await discoverAndLoadExtensions([resolve("src/extension.ts")], cwd, join(cwd, "empty-agent-dir"));
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.extensions.length, 1);
    let branch: BranchEntry[] = [];
    const messages: string[] = [], notifications: string[] = [];
    loaded.runtime.appendEntry = (customType, data) => { branch.push({ type: "custom", customType, data }); };
    loaded.runtime.sendMessage = message => { messages.push(String(message.content)); };
    const ctx = { cwd, mode: "print", hasUI: false, model: undefined, scopedModels: [], signal: undefined,
        ui: { setStatus() { }, notify(message: string) { notifications.push(message); } }, sessionManager: { getBranch: () => branch }, isProjectTrusted: () => true,
    } as unknown as ExtensionCommandContext;
    const extension = loaded.extensions[0]!;
    async function emit(event: string) { for (const h of extension.handlers.get(event) ?? [])
        await h({ type: event }, ctx); }
    async function tool(name: string, args: Record<string, unknown>) { return extension.tools.get(name)!.definition.execute("test", args, undefined, undefined, ctx); }
    return { cwd, loaded, extension, ctx, messages, notifications, emit, tool, getBranch: () => structuredClone(branch), setBranch: (b: BranchEntry[]) => { branch = b; }, command: (args: string) => extension.commands.get("math")!.handler(args, ctx), cleanup: () => rm(cwd, { recursive: true, force: true }) };
}
test("published Pi loader registers four tools and human-only commands without starting background work", async () => {
    const h = await harness();
    try {
        assert.deepEqual([...h.extension.tools.keys()].sort(), ["math_check", "math_discover", "math_note", "math_research"]);
        assert.ok(h.extension.commands.has("math"));
        assert.equal(h.getBranch().length, 0);
        const schema = h.extension.tools.get("math_research")!.definition.parameters;
        assert.equal(Check(schema, { action: "approve" }), false);
        assert.equal(Check(schema, { action: "run" }), true);
        await h.command("help");
        assert.match(h.messages.at(-1)!, /\/math approve/);
        assert.deepEqual(h.notifications, []);
    }
    finally {
        await h.cleanup();
    }
});
test("real extension commands and tools restore the selected session branch", async () => {
    const h = await harness();
    try {
        await h.emit("session_start");
        await h.command("start Original question");
        const first = h.getBranch();
        await h.command("start Different question");
        assert.equal((await h.tool("math_research", { action: "status" })).content[0]!.type, "text");
        await h.emit("session_before_tree");
        h.setBranch(first);
        await h.emit("session_tree");
        await h.command("status");
        assert.match(h.messages.at(-1)!, /Original question/);
        assert.doesNotMatch(h.messages.at(-1)!, /Different question/);
        assert.deepEqual(h.notifications, []);
    }
    finally {
        await h.cleanup();
    }
});
test("parallel tools cannot race even during cold initialization", async () => {
    const h = await harness();
    try {
        const results = await Promise.allSettled([h.tool("math_research", { action: "start", problem: "First" }), h.tool("math_research", { action: "start", problem: "Second" })]);
        assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
        assert.equal(results.filter(r => r.status === "rejected").length, 1);
        const restored = await restoreWorkbench(new ObjectStore(h.cwd), h.getBranch());
        assert.equal(restored.proof!.problem, "First");
    }
    finally {
        await h.cleanup();
    }
});
test("a simultaneous status read cannot let a mutation bypass checkpoint restoration", async () => {
    const h = await harness();
    try {
        const store = new ObjectStore(h.cwd), w = emptyWorkbench();
        w.proof = newResearch("Existing target");
        h.setBranch([{ type: "custom", customType: WORKBENCH_TYPE, data: { version: 1, hash: await store.put(w) } }]);
        const results = await Promise.allSettled([h.tool("math_research", { action: "status" }), h.tool("math_research", { action: "start", problem: "Unapproved replacement" })]);
        assert.equal(results[0]!.status, "fulfilled");
        assert.equal(results[1]!.status, "rejected");
        assert.equal(h.getBranch().length, 1);
        assert.equal((await restoreWorkbench(store, h.getBranch())).proof!.problem, "Existing target");
    }
    finally {
        await h.cleanup();
    }
});
test("Pi adapter isolates context, respects role/scoped models, disables retries and rejects incomplete responses", async () => {
    const model = { id: "fixture", provider: "fixture", api: "openai-responses" } as NonNullable<ExtensionContext["model"]>;
    let context: Context | undefined, options: Record<string, unknown> | undefined;
    const response: AssistantMessage = { role: "assistant", api: "openai-responses", provider: "fixture", model: "fixture", content: [{ type: "text", text: '{"ok":true}' }], stopReason: "stop", timestamp: 0,
        usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
    const registry = { find: () => model, async complete(_model: unknown, ctx: Context, opts: Record<string, unknown>) { context = ctx; options = opts; return response; } } as unknown as ExtensionContext["modelRegistry"];
    const worker = new PiWorker({ model, modelRegistry: registry, scopedModels: [] }, ConfigSchema.parse({ models: { critic: { provider: "fixture", id: "fixture" } } }));
    const request = { id: "test", role: "section/critic", system: "Specific task", prompt: "Only supplied evidence", maxOutputTokens: 1024, signal: new AbortController().signal };
    assert.equal((await worker.complete(request)).text, '{"ok":true}');
    assert.equal(context!.messages.length, 1);
    assert.deepEqual(context!.tools, []);
    assert.equal(context!.systemPrompt, "Specific task");
    assert.equal(options!.maxTokens, 1024);
    assert.equal(options!.maxRetries, 0);
    assert.equal(options!.signal, request.signal);
    response.stopReason = "length";
    await assert.rejects(worker.complete(request), /length/);
    response.stopReason = "stop";
    const restricted = new PiWorker({ model, modelRegistry: registry, scopedModels: [{ model: { ...model, id: "another" } }] }, ConfigSchema.parse({}));
    await assert.rejects(restricted.complete(request), /scoped/);
});
test("workbench exports contain portable model records, certificates and the original research state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pi-math-export-"));
    try {
        const store = new ObjectStore(dir), w = emptyWorkbench();
        w.proof = newResearch("Test target");
        w.audit.push(await store.put({ role: "fixture", response: "recorded" }));
        const path = await exportWorkbench(store, w);
        const output = JSON.parse(await readFile(join(path, "research.json"), "utf8"));
        assert.equal(output.audit[0].value.response, "recorded");
        assert.equal(output.state.proof.problem, "Test target");
        assert.match(await readFile(join(path, "research.md"), "utf8"), /No final human acceptance/);
        assert.match(await readFile(join(path, "proof.tex"), "utf8"), /\\documentclass/);
        await assert.rejects(readProjectJson(dir, "../missing"));
        await writeFile(join(dir, "bad.json"), "no");
        await assert.rejects(readProjectJson(dir, "bad.json"));
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
});
test("bounded symbolic policy runs without a model and survives checkpoint validation", async () => {
    const d = parseDataset(JSON.parse(await readFile(new URL("../examples/euler-data.json", import.meta.url), "utf8")));
    const w = emptyWorkbench();
    w.discovery = newDiscovery(d, 1);
    await new DiscoveryEngine(w.discovery, new HeuristicPolicy(), new AlgebraProver()).step();
    assert.equal(w.discovery.rounds.length, 1);
    assert.equal(parseWorkbench(w).discovery!.rounds.length, 1);
});
test("session navigation cancels an uncooperative model and prevents late checkpoint writes", async () => {
    const h = await harness();
    let finish!: () => void, started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; }), late = new Promise<void>(resolve => { finish = resolve; });
    try {
        Object.assign(h.ctx, { model: { id: "fixture", provider: "fixture" }, modelRegistry: { async complete() { started(); await late; throw new Error("Late provider response"); } } });
        await h.command("start Original target");
        const before = h.getBranch();
        const running = h.tool("math_research", { action: "run" });
        const failed = assert.rejects(running);
        await ready;
        await h.emit("session_before_tree");
        await failed;
        h.setBranch(before);
        await h.emit("session_tree");
        const count = h.getBranch().length;
        finish();
        await new Promise(resolve => setImmediate(resolve));
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(h.getBranch().length, count);
        const restored = await restoreWorkbench(new ObjectStore(h.cwd), h.getBranch());
        assert.equal(restored.proof!.problem, "Original target");
        assert.equal(restored.audit.length, 0);
    }
    finally {
        finish?.();
        await h.cleanup();
    }
});
