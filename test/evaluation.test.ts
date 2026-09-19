import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { evaluate, evaluationConfig, checkCounterexample, EVALUATION_TASKS } from "../src/evaluation.ts";
import { ConfigSchema } from "../src/schema.ts";
import type { WorkerRequest } from "../src/inference.ts";

test("evaluation separates exact counterexamples, model output, rubrics, and human judgments", async () => {
    const seen: WorkerRequest[] = [];
    const cfg = evaluationConfig(ConfigSchema.parse({ generation: { default: { thinkingBudget: 2048 }, "verify/critic": { maxOutputTokens: 8192 } } }), 1024);
    const report = await evaluate({ complete: async req => {
        seen.push(req);
        const body = req.role === "discovery/feature" ? { n: 40, factor: 41, explanation: "40^2+40+41=41^2" } : req.role === "verify/critic" ? { verdict: "accept", summary: "Scripted acceptance, deliberately wrong for two tasks", issues: [], resolved: [] } : { body: "Scripted incomplete proof", claimedResult: "Claim", status: "complete", assumptions: [], usedDependencies: [], gaps: [] };
        return { text: JSON.stringify(body), model: "fixture/only", usage: { input: 10, output: 20, cost: 0 } };
    } }, cfg, { mode: "fixture", label: "Deliberately imperfect fixture" });
    assert.equal(report.cases.length, 6);
    assert.equal(report.usage.calls, 6);
    assert.equal(report.usage.reservedOutputTokens, 6144);
    assert.equal(report.cases[4]!.exactWitness, true);
    assert.ok(report.cases.every(c => c.humanJudgment === null));
    assert.equal(report.cases[2]!.status, "returned"); // A returned false acceptance does NOT become a pass.
    assert.equal(report.config.generation.default!.thinkingBudget, undefined);
    for (const req of seen) for (const task of EVALUATION_TASKS) assert.ok(!req.prompt.includes(task.rubric) && !req.system.includes(task.rubric));
    assert.equal(report.records.length, 6);
    assert.match(report.qualityClaim, /Human adjudication/);
});

test("evaluation preserves partial failures without exceeding budget or accepting bogus factors", async () => {
    let calls = 0, checkpoints = 0;
    const cfg = evaluationConfig(ConfigSchema.parse({}), 512);
    const result = await evaluate({ complete: async () => { calls++; throw new Error("fixture disconnected"); } }, cfg, { mode: "fixture", label: "failure", checkpoint: async () => { checkpoints++; } });
    assert.equal(calls, 6); assert.equal(result.records.length, 6); assert.equal(checkpoints, 7);
    assert.ok(result.cases.every(c => c.status === "error"));
    assert.equal(checkCounterexample({ n: 40, factor: 1, explanation: "No" }), false);
    assert.equal(checkCounterexample({ n: 0, factor: 41, explanation: "Not proper" }), false);
    assert.equal(checkCounterexample({ n: 1, factor: 2, explanation: "Wrong" }), false);
    assert.equal(checkCounterexample({ n: -1, factor: 41, explanation: "Outside domain" }), false);
    assert.equal(checkCounterexample({ n: 41, factor: 41, explanation: "Valid too" }), true);
});

test("evaluation CLI is a credential-free dry run by default and rejects unknown options", async () => {
    const run = promisify(execFile);
    const { stdout } = await run(process.execPath, ["--import", "tsx", "examples/evaluate-models.ts", "--preset", "local-bonsai", "--max-output", "1024"]);
    assert.match(stdout, /"maxReservedOutputTokens": 6144/); assert.match(stdout, /No files changed; no model requests/);
    await assert.rejects(run(process.execPath, ["--import", "tsx", "examples/evaluate-models.ts", "--liv"]));
    await assert.rejects(run(process.execPath, ["--import", "tsx", "examples/evaluate-models.ts", "--live"]));
});
