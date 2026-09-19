import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DiscoveryEngine, newDiscovery, parseDataset, unionWeights, type Patch, type Controls } from "../src/discovery.ts";
import { HeuristicPolicy } from "../src/policies.ts";
import { AlgebraProver } from "../src/certificate.ts";
import { formatExpr, canonical } from "../src/expressions.ts";
import { seededRandom } from "../src/inference.ts";
const fixture = parseDataset(JSON.parse(await readFile(new URL("./euler-data.json", import.meta.url), "utf8")));
const modes = [
    { name: "full", dynamicData: true, proofFeedback: true, controller: true },
    { name: "no-skeptic", dynamicData: false, proofFeedback: true, controller: true },
    { name: "no-proof-feedback", dynamicData: true, proofFeedback: false, controller: true },
    { name: "regression-only", dynamicData: false, proofFeedback: false, controller: false },
];
interface Result {
    seed: number;
    mode: string;
    status: string;
    rounds: number;
    checkedNondegenerate: number;
    distinctConjectures: number;
    visibleAtEnd: number;
    trajectory: {
        round: number;
        statement: string;
        featureCount: number;
        priors: Controls["priors"];
        proof: string;
        counterexamples: string[];
        nondegenerate: boolean;
        weightsBefore: Patch[];
        weightsAfter: Patch[];
    }[];
}
const results: Result[] = [];
for (const seed of [11, 29, 47, 71, 101])
    for (const mode of modes) {
        const random = seededRandom(seed), data = structuredClone(fixture);
        // Same seeded initial exposures for paired modes. Ablating the skeptic fixes
        // every weight to one inside the engine, matching the documented intervention.
        for (const patch of data.patches)
            patch.weights = patch.weights.map(w => w === 0 ? 0 : 0.5 + random() / 2);
        const state = newDiscovery(data, 3);
        state.ablations = { dynamicData: mode.dynamicData, proofFeedback: mode.proofFeedback, controller: mode.controller };
        const engine = new DiscoveryEngine(state, new HeuristicPolicy(), new AlgebraProver());
        while (state.status === "active")
            await engine.step();
        results.push({ seed, mode: mode.name, status: state.status, rounds: state.rounds.length,
            checkedNondegenerate: state.rounds.filter(r => r.proof.rho === 1 && r.evidence.nondegenerate).length,
            distinctConjectures: new Set(state.rounds.map(r => canonical(r.conjecture))).size,
            visibleAtEnd: unionWeights(state.dataset).filter(w => w > 0).length,
            trajectory: state.rounds.map(r => ({ round: r.index + 1, statement: formatExpr(r.conjecture), featureCount: r.controls.featureCount, priors: r.controls.priors, proof: r.proof.outcome,
                counterexamples: r.evidence.counterexamples, nondegenerate: r.evidence.nondegenerate, weightsBefore: r.weightsBefore, weightsAfter: r.weightsAfter })) });
    }
const summary = modes.map(mode => {
    const rows = results.filter(r => r.mode === mode.name);
    return { mode: mode.name, episodes: rows.length, successfulEpisodes: rows.filter(r => r.checkedNondegenerate > 0).length,
        meanDistinctConjectures: rows.reduce((s, r) => s + r.distinctConjectures, 0) / rows.length,
        meanVisibleAtEnd: rows.reduce((s, r) => s + r.visibleAtEnd, 0) / rows.length };
});
const caveat = "Small deterministic engineering ablation using a bounded enumerator and exact linear prover on hand-written data. No learned MADDPG policies, PySR, live models, statistical significance, or replication of paper results is claimed. All modes still measure proof outcomes; the feedback ablation withholds them from the policy. A success is relative to supplied premises, not a new theorem.";
const report = { version: 1, seeds: [11, 29, 47, 71, 101], roundLimit: 3, caveat, summary, results };
const out = resolve(process.argv[2] ?? "test-output/ablations");
await mkdir(out, { recursive: true });
await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
const md = `# Offline ablation\n\n${caveat}\n\n| Mode | Episodes | Successful episodes | Mean distinct conjectures | Mean visible rows |\n| --- | ---: | ---: | ---: | ---: |\n${summary.map(r => `| ${r.mode} | ${r.episodes} | ${r.successfulEpisodes} | ${r.meanDistinctConjectures} | ${r.meanVisibleAtEnd} |`).join("\n")}\n\nAll trajectories, exposures and seeds are in report.json. Five seeds perturb initial weights on one fixture; they are not five independent mathematical tasks.\n`;
await writeFile(join(out, "report.md"), md);
console.log(md);
