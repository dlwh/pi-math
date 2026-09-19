import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigSchema, PlanSchema, parseJson, SectionSchema } from "../src/schema.ts";
import { descendants, emptyProgress, frontier, reviseGraph, validatePlan } from "../src/graph.ts";
import { ObjectStore } from "../src/store.ts";
export const diamond = PlanSchema.parse({ title: "Diamond", abstract: "Plan", conclusionId: "d", sections: [
        { id: "a", title: "A", task: "A", dependsOn: [], obligations: [] },
        { id: "b", title: "B", task: "B", dependsOn: ["a"], obligations: [] },
        { id: "c", title: "C", task: "C", dependsOn: ["a"], obligations: [] },
        { id: "d", title: "D", task: "D", dependsOn: ["b", "c"], obligations: [] },
    ] });
test("DAG rejects cycles, missing dependencies, duplicate IDs and disconnected results", () => {
    validatePlan(diamond);
    for (const mutate of [
        (p: typeof diamond) => { p.sections[0]!.dependsOn = ["d"]; },
        (p: typeof diamond) => { p.sections[1]!.dependsOn = ["missing"]; },
        (p: typeof diamond) => { p.sections[1]!.id = "a"; },
        (p: typeof diamond) => { p.sections[3]!.dependsOn = ["b"]; },
    ]) {
        const p = structuredClone(diamond);
        mutate(p);
        assert.throws(() => validatePlan(p));
    }
    assert.throws(() => validatePlan(diamond, ["unassigned"]));
});
test("repairs invalidate all descendants but preserve independent accepted work", () => {
    assert.deepEqual([...descendants(diamond, ["b"])].sort(), ["b", "d"]);
    const progress = Object.fromEntries(diamond.sections.map(s => [s.id, { ...emptyProgress(), status: "accepted" as const }]));
    const changed = reviseGraph(diamond, diamond, progress, ["b"]);
    assert.equal(changed.a!.status, "accepted");
    assert.equal(changed.c!.status, "accepted");
    assert.equal(changed.b!.status, "pending");
    assert.equal(changed.d!.status, "pending");
    assert.deepEqual(frontier(diamond, changed), ["b"]);
    const next = structuredClone(diamond);
    next.sections[0]!.task = "Changed hypothesis";
    assert.ok(Object.values(reviseGraph(diamond, next, progress, [])).every(p => p.status === "pending"));
});
test("strict model JSON does not extract a convenient object from trailing prose", () => {
    assert.throws(() => parseJson('{"status":"complete"} this is a proof', SectionSchema));
    assert.throws(() => ConfigSchema.parse({ widths: [2, 2] }));
    assert.throws(() => ConfigSchema.parse({ maxCalls: NaN }));
});
test("immutable object storage detects corruption, rejects traversal and symlinks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "pi-math-store-"));
    try {
        const store = new ObjectStore(cwd);
        const key = await store.put({ proof: "draft" });
        assert.equal(await store.put({ proof: "draft" }), key);
        assert.deepEqual(await store.get(key), { proof: "draft" });
        await assert.rejects(store.get("../secret"));
        await writeFile(join(store.root, "objects", key + ".json"), '{"proof":"changed"}');
        await assert.rejects(store.get(key), /hash mismatch/);
        await assert.rejects(store.put({ proof: "draft" }), /hash mismatch/);
        const other = await mkdtemp(join(tmpdir(), "pi-math-symlink-"));
        try {
            await symlink(cwd, join(other, ".pi"));
            await assert.rejects(new ObjectStore(other).put({ a: 1 }), /symlink/);
        }
        finally {
            await rm(other, { recursive: true, force: true });
        }
    }
    finally {
        await rm(cwd, { recursive: true, force: true });
    }
});
