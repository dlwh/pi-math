import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRegistry, ModelRuntime } from "@earendil-works/pi-coding-agent";
import { z } from "zod";
import { PiWorker, isLoopback, workerSettings } from "../src/adapter.ts";
import { Broker } from "../src/inference.ts";
import { PRESETS } from "../src/presets.ts";
import { probe } from "../src/onboarding.ts";
import { ConfigSchema, generationFor } from "../src/schema.ts";

async function fixture(compat: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
    const modelId = typeof extra.id === "string" ? extra.id : "deepseek-v4.1-flash";
    const dir = await mkdtemp(join(tmpdir(), "pi-math-http-"));
    const seen: Record<string, any>[] = [];
    let sawRequest!: () => void;
    const received = new Promise<void>(resolve => { sawRequest = resolve; });
    let reply = { status: 200, content: '{"answer":4}', finish: "stop", tool: false, reasoning: true, redirect: false, hang: false, disconnect: false, probe: false };
    const server = createServer(async (req, res) => {
        let body = "";
        for await (const chunk of req) body += chunk;
        seen.push(JSON.parse(body)); sawRequest();
        if (reply.hang) return;
        if (reply.disconnect) { req.socket.destroy(); return; }
        if (reply.redirect) { res.writeHead(307, { location: "http://example.invalid/v1/chat/completions" }); res.end(); return; }
        if (reply.status !== 200) { res.writeHead(reply.status, { "content-type": "application/json" }); res.end(JSON.stringify({ error: { message: "fixture error" } })); return; }
        res.writeHead(200, { "content-type": "text/event-stream" });
        const delta = (d: unknown, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: "fixture", model: "deepseek-v4.1-flash", object: "chat.completion.chunk", choices: [{ index: 0, delta: d, finish_reason }] })}\n\n`);
        if (reply.reasoning) delta({ reasoning_content: "Private scratch work is not final JSON." });
        if (reply.tool) delta({ tool_calls: [{ index: 0, id: "bad", type: "function", function: { name: "shell", arguments: "{}" } }] });
        else {
            const review = { verdict: "reject", summary: "2 is an even prime", issues: [{ claim: "All primes odd", reason: "2 is even", severity: "fatal", scope: "target", sections: [] }], resolved: [] };
            const content = reply.probe ? JSON.stringify(seen.length === 1 ? { answer: 4, explanation: "Two pairs make four" } : review) : reply.content;
            delta({ content });
        }
        delta({}, reply.finish);
        res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 15, completion_tokens: 20, total_tokens: 35 } })}\n\n`);
        res.end("data: [DONE]\n\n");
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    await writeFile(join(dir, "models.json"), JSON.stringify({ providers: { fixture: {
        baseUrl: `http://127.0.0.1:${address.port}/v1`, api: "openai-completions", apiKey: "offline-fixture-placeholder",
        models: [{ id: "deepseek-v4.1-flash", reasoning: true, contextWindow: 32768, maxTokens: 16384,
            compat: { supportsDeveloperRole: false, supportsStore: false, maxTokensField: "max_tokens", supportsReasoningEffort: true, ...compat }, ...extra }],
    } } }));
    const runtime = await ModelRuntime.create({ modelsPath: join(dir, "models.json"), authPath: join(dir, "auth.json"), modelsStorePath: join(dir, "store.json"), allowModelNetwork: false });
    const registry = new ModelRegistry(runtime);
    assert.equal(registry.getError(), undefined);
    const ctx = { model: registry.find("fixture", modelId), modelRegistry: registry, scopedModels: [] };
    return { ctx, seen, received, set: (patch: Partial<typeof reply>) => { reply = { ...reply, ...patch }; }, cleanup: async () => {
        server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(dir, { recursive: true, force: true });
    } };
}
const answer = z.object({ answer: z.number() }).strict();

test("real Pi transport enables reasoning, sends schemas, isolates scratch text, and reports usage", async () => {
    const f = await fixture({ thinkingFormat: "openrouter" });
    try {
        const cfg = ConfigSchema.parse({ localOnly: true, generation: { default: { reasoning: "high", structuredOutput: "json-schema" } } });
        const audits: any[] = [];
        const broker = new Broker(new PiWorker(f.ctx, cfg), cfg, async r => { audits.push(r); });
        assert.deepEqual(await broker.ask("section/generate", "Compute 2+2.", {}, answer), { answer: 4 });
        assert.equal(f.seen[0]!.reasoning.effort, "high");
        assert.equal(f.seen[0]!.response_format.json_schema.strict, true);
        assert.equal(f.seen[0]!.messages[0].role, "system");
        assert.equal(f.seen[0]!.max_tokens, 4096);
        assert.ok(!f.seen[0]!.tools?.length);
        assert.equal(broker.usage.calls, 1);
        assert.equal(broker.usage.output, 20);
        assert.equal(audits[0].response.settings.reasoning, "high");
        assert.doesNotMatch(audits[0].response.text, /Private scratch/);
    } finally { await f.cleanup(); }
});

test("role generation overrides reserve the actual maximum before dispatch", async () => {
    const f = await fixture();
    try {
        const cfg = ConfigSchema.parse({ maxReservedOutputTokens: 5000, generation: { default: { temperature: 1 }, section: { maxOutputTokens: 3000 }, critic: { reasoning: "low" }, "section/critic": { maxOutputTokens: 2048 } } });
        assert.deepEqual(generationFor(cfg, "section/critic"), { temperature: 1, maxOutputTokens: 2048, reasoning: "low" });
        const broker = new Broker(new PiWorker(f.ctx, cfg), cfg);
        await broker.ask("section/critic", "Compute", {}, answer);
        await assert.rejects(broker.ask("section/generate", "Compute", {}, answer), /budget exhausted/);
        assert.equal(f.seen.length, 1);
        assert.equal(f.seen[0]!.max_tokens, 2048);
        assert.equal(broker.usage.reservedOutputTokens, 2048);
    } finally { await f.cleanup(); }
});

test("native numeric effort remains a number and provider defaults remove off controls", async () => {
    const f = await fixture({ thinkingFormat: "deepseek" });
    try {
        for (const reasoning of [100, "default"] as const) {
            const cfg = ConfigSchema.parse({ generation: { default: { reasoning } } });
            await new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "Compute", {}, answer);
        }
        assert.equal(f.seen[0]!.reasoning_effort, 100);
        assert.equal(f.seen[0]!.thinking.type, "enabled");
        assert.equal(f.seen[1]!.thinking, undefined);
        assert.equal(f.seen[1]!.reasoning_effort, undefined);
    } finally { await f.cleanup(); }
});

test("mandatory reasoning and reserved final-answer room reject invalid settings without dispatch", async () => {
    const f = await fixture({ thinkingTokenBudgetField: "thinking_budget_tokens" }, { thinkingLevelMap: { off: null, high: "high" } });
    try {
        for (const generation of [{ reasoning: "off" }, { reasoning: "high", thinkingBudget: 4000, finalAnswerReserve: 1024 }]) {
            const cfg = ConfigSchema.parse({ generation: { default: generation } });
            await assert.rejects(new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "Compute", {}, answer));
        }
        assert.equal(f.seen.length, 0);
        const cfg = ConfigSchema.parse({ generation: { default: { reasoning: "high", thinkingBudget: 2048 } } });
        await new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "Compute", {}, answer);
        assert.equal(f.seen[0]!.thinking_budget_tokens, 2048);
    } finally { await f.cleanup(); }
});

test("context overflow and dangerous inherited payload overrides never reach a server", async () => {
    for (const extra of [{ samplingParams: { max_tokens: 1000000 } }, { samplingParams: { tools: [] } }, { samplingParams: { model: "remote" } }]) {
        const f = await fixture({}, extra);
        try {
            const cfg = ConfigSchema.parse({});
            await assert.rejects(new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "Compute", {}, answer), /samplingParams/);
            assert.equal(f.seen.length, 0);
        } finally { await f.cleanup(); }
    }
    const f = await fixture();
    try {
        const cfg = ConfigSchema.parse({ maxOutputTokens: 512, generation: { default: { contextWindow: 1024 } } });
        await assert.rejects(new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "x".repeat(1024), {}, answer), /context/);
        assert.equal(f.seen.length, 0);
    } finally { await f.cleanup(); }
});

test("provider failures, truncation, malformed JSON and tool calls fail without retries", async () => {
    const f = await fixture();
    try {
        const cfg = ConfigSchema.parse({});
        const scenarios = [{ status: 401 }, { status: 404 }, { status: 429 }, { content: "not JSON" }, { finish: "length" }, { tool: true, finish: "tool_calls" }, { content: "" }];
        for (const scenario of scenarios) {
            f.set({ status: 200, content: '{"answer":4}', finish: "stop", tool: false, ...scenario });
            const before = f.seen.length;
            await assert.rejects(new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "Compute", {}, answer));
            assert.equal(f.seen.length, before + 1);
        }
    } finally { await f.cleanup(); }
});

test("local-only workers reject cloud destinations and HTTP redirects", async () => {
    const f = await fixture();
    try {
        assert.equal(isLoopback("http://localhost:8080/v1"), true);
        assert.equal(isLoopback("http://127.0.0.1.example.com/v1"), false);
        assert.equal(isLoopback("http://user:secret@localhost/v1"), false);
        const cfg = ConfigSchema.parse({ localOnly: true });
        const ctx = { ...f.ctx, model: { ...f.ctx.model!, baseUrl: "https://example.invalid/v1" } };
        await assert.rejects(new Broker(new PiWorker(ctx, cfg), cfg).ask("test", "Compute", {}, answer), /Local-only/);
        assert.equal(f.seen.length, 0);
        f.set({ redirect: true });
        await assert.rejects(new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "Compute", {}, answer));
        assert.equal(f.seen.length, 1);
    } finally { await f.cleanup(); }
});


test("explicit doctor probe makes only two bounded synthetic requests through Pi", async () => {
    const f = await fixture();
    try {
        f.set({ probe: true });
        const cfg = ConfigSchema.parse({ maxOutputTokens: 16384, generation: { "section/generate": { maxOutputTokens: 12000 }, "verify/critic": { maxOutputTokens: 10000 } } });
        const result = await probe(f.ctx, cfg);
        assert.equal(result.ok, true); assert.equal(result.usage.calls, 2);
        assert.equal(result.usage.reservedOutputTokens, 8192);
        assert.ok(f.seen.every(p => p.max_tokens === 4096));
        assert.equal(result.records.length, 2);
    } finally { await f.cleanup(); }
});

test("real HTTP disconnects and timeouts terminate without retrying or dispatching queued work", async () => {
    const f = await fixture();
    try {
        f.set({ disconnect: true });
        const cfg = ConfigSchema.parse({ concurrency: 1, timeoutMs: 1000 });
        await assert.rejects(new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "Compute", {}, answer));
        assert.equal(f.seen.length, 1);
        f.set({ disconnect: false, hang: true });
        const broker = new Broker(new PiWorker(f.ctx, cfg), cfg);
        const results = await Promise.allSettled([broker.ask("test", "First", {}, answer), broker.ask("test", "Queued", {}, answer)]);
        assert.ok(results.every(r => r.status === "rejected"));
        assert.equal(broker.usage.calls, 1);
        assert.equal(f.seen.length, 2);
    } finally { await f.cleanup(); }
});


test("every preset emits its declared reasoning and cap through the actual Pi HTTP client", async () => {
    for (const p of PRESETS) {
        const provider = p.providers[p.model.provider]!;
        const model = (provider.models as Record<string, any>[])[0]!;
        const f = await fixture(model.compat, { id: p.model.id, thinkingLevelMap: model.thinkingLevelMap ?? {}, maxTokens: model.maxTokens, contextWindow: model.contextWindow });
        try {
            const cfg = ConfigSchema.parse({ ...p.settings.inference, localOnly: true, models: { default: { provider: "fixture", id: p.model.id } } });
            await new Broker(new PiWorker(f.ctx, cfg), cfg).ask("section/generate", "Compute", {}, answer);
            const sent = f.seen[0]!;
            assert.equal(sent.model, p.model.id, p.id);
            assert.equal(sent.max_tokens, cfg.maxOutputTokens, p.id);
            const format = model.compat.thinkingFormat;
            if (format === "openrouter") assert.equal(sent.reasoning.effort, cfg.generation.default!.reasoning, p.id);
            else if (format === "chat-template") { assert.equal(sent.chat_template_kwargs.enable_thinking, true, p.id); assert.equal(sent.chat_template_kwargs.reasoning_effort, "medium", p.id); }
            else if (format === "qwen-chat-template") assert.equal(sent.chat_template_kwargs.enable_thinking, true, p.id);
            else if (format === "deepseek") assert.equal(sent.thinking.type, "enabled", p.id);
            else assert.equal(sent.reasoning_effort, cfg.generation.default!.reasoning, p.id);
        } finally { await f.cleanup(); }
    }
});

test("alternate cap fields and final serialized payload guards cannot bypass reservations", async () => {
    const f = await fixture({ maxTokensField: "max_completion_tokens" });
    try {
        const cfg = ConfigSchema.parse({});
        await new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "Compute", {}, answer);
        assert.equal(f.seen[0]!.max_completion_tokens, 4096); assert.equal(f.seen[0]!.max_tokens, undefined);
        const original = f.ctx.modelRegistry.complete.bind(f.ctx.modelRegistry);
        for (const patch of [{ max_completion_tokens: 999999 }, { model: "another-model" }, { tools: [{ type: "function" }] }, { n: 2 }]) {
            f.ctx.modelRegistry.complete = ((model: any, context: any, options: any) => original(model, context, { ...options, onPayload: async (payload: any) => ({ ...await options.onPayload(payload), ...patch }) })) as typeof f.ctx.modelRegistry.complete;
            await assert.rejects(new Broker(new PiWorker(f.ctx, cfg), cfg).ask("test", "Compute", {}, answer));
        }
        assert.equal(f.seen.length, 1);
    } finally { await f.cleanup(); }
});


test("preflight exposes provider defaults and rejects direct Kimi sampling or undeclared off", async () => {
    const f = await fixture();
    try {
        const cfg = ConfigSchema.parse({ generation: { default: { reasoning: "off" } } });
        assert.throws(() => workerSettings(f.ctx, cfg, "test"), /off mapping/);
        const kimi = { ...f.ctx.model!, provider: "moonshotai", id: "kimi-k3" };
        assert.throws(() => workerSettings({ ...f.ctx, model: kimi }, ConfigSchema.parse({ generation: { default: { temperature: 1 } } }), "test"), /fixes sampling/);
        const other = { ...f.ctx.model!, api: "anthropic-messages" as const };
        assert.equal(workerSettings({ ...f.ctx, model: other }, ConfigSchema.parse({}), "test").reasoning, "default");
        assert.throws(() => workerSettings({ ...f.ctx, model: other }, ConfigSchema.parse({ generation: { default: { reasoning: "high" } } }), "test"), /OpenAI-compatible/);
        assert.equal(f.seen.length, 0);
    } finally { await f.cleanup(); }
});

test("cancellation aborts an actual waiting HTTP request and never starts its queued sibling", async () => {
    const f = await fixture();
    try {
        f.set({ hang: true });
        const stop = new AbortController(), cfg = ConfigSchema.parse({ concurrency: 1 });
        const broker = new Broker(new PiWorker(f.ctx, cfg), cfg, undefined, stop.signal);
        const settled = Promise.allSettled([broker.ask("test", "Active", {}, answer), broker.ask("test", "Queued", {}, answer)]);
        await f.received;
        stop.abort();
        assert.ok((await settled).every(r => r.status === "rejected"));
        assert.equal(f.seen.length, 1); assert.equal(broker.usage.calls, 1);
    } finally { await f.cleanup(); }
});
