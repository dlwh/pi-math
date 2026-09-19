import { z } from "zod";
import { Broker, type Worker, type AuditRecord } from "./inference.ts";
import { ConfigSchema, ReviewSchema, SectionSchema, type Config, type Generation } from "./schema.ts";
import { hash as digest } from "./store.ts";

export const EVALUATION_REVISION = "math-onboarding-v1";
const CounterexampleSchema = z.object({ n: z.number().int().min(0).max(1000000), factor: z.number().int().min(2).max(1000000000041), explanation: z.string().min(1).max(10000) }).strict();
/** Prompts and adjudication rubrics are separate: no answer key enters the request. */
export const EVALUATION_TASKS = [
    { id: "proof-odd-sum", role: "section/generate", kind: "proof", instruction: "Write a complete elementary proof. Do not assert a machine certificate.", input: { target: "For every integer n >= 1, the sum of the first n positive odd integers is n^2.", dependencies: [] }, rubric: "Check the base case and induction step or an equally complete argument. Check the quantified domain. Status complete is a claim, not a score." },
    { id: "valid-proof", role: "verify/critic", kind: "review", instruction: "Review the target and argument for mathematical correctness; report material gaps precisely.", input: { target: "The sum of the first n positive odd integers is n^2 for every integer n >= 1.", proof: "At n=1 the sum is 1=1^2. If the sum through 2k-1 is k^2, adding 2k+1 gives k^2+2k+1=(k+1)^2. Induction proves the claim.", inheritedObjections: [] }, rubric: "This proof is valid. Check whether the reviewer invents a fatal objection; minor exposition suggestions are permissible." },
    { id: "flawed-proof", role: "verify/critic", kind: "review", instruction: "Review the target and argument for mathematical correctness; report material gaps precisely.", input: { target: "Every continuous real function is differentiable at every real point.", proof: "The difference quotient is a quotient of continuous functions, so its limit always exists as the increment approaches zero.", inheritedObjections: [] }, rubric: "Reject/revise: continuity does not supply the derivative limit; abs(x) at zero is a counterexample. Check the explanation, not just verdict." },
    { id: "missing-hypothesis", role: "verify/critic", kind: "review", instruction: "Review the target and argument for mathematical correctness; report material gaps precisely.", input: { target: "For every real x, sqrt(x^2)=x.", proof: "Square root and squaring are inverse operations, so they cancel.", inheritedObjections: [] }, rubric: "Reject/revise: the correct expression is abs(x); x >= 0 is missing if the right side remains x. A negative x suffices." },
    { id: "counterexample", role: "discovery/feature", kind: "counterexample", instruction: "Find a counterexample. Return an integer n in the domain and a proper integer factor of the resulting polynomial value.", input: { claim: "For every integer n >= 0, n^2+n+41 is prime." }, rubric: "The harness checks the exact integer divisibility and domain. It does not accept an explanation in place of a witness." },
    { id: "repair", role: "revise/generate", kind: "proof", instruction: "Repair the proof for the explicitly amended target. Address the supplied objection and retain the new hypothesis.", input: { target: "Every prime integer p > 2 is odd.", rejectedArgument: "Every prime is odd because the examples checked were odd.", objection: "2 is a prime and even. A finite list of examples cannot prove a universal claim.", dependencies: [] }, rubric: "Explain that an even p > 2 is divisible by 2 and is composite. Keep p > 2. Do not silently claim all primes are odd." },
] as const;
export function evaluationConfig(base: Config, maxOutputTokens = 4096, reasoning?: Generation["reasoning"]): Config {
    const generation = structuredClone(base.generation);
    for (const [key, value] of Object.entries(generation)) {
        const { thinkingBudget: _budget, finalAnswerReserve: _reserve, ...rest } = value;
        generation[key] = { ...rest, maxOutputTokens, ...(reasoning === undefined ? {} : { reasoning }) };
    }
    generation.default = { ...generation.default, maxOutputTokens, ...(reasoning === undefined ? {} : { reasoning }) };
    return ConfigSchema.parse({ ...base, generation, concurrency: 1, maxCalls: EVALUATION_TASKS.length, maxOutputTokens, maxReservedOutputTokens: EVALUATION_TASKS.length * maxOutputTokens });
}
export interface EvaluationResult {
    revision: string; mode: "live" | "fixture"; label: string; startedAt: string; finishedAt: string | null;
    config: Config; configHash: string; tasksHash: string;
    cases: { id: string; status: "returned" | "error"; output: unknown; error: string | null; exactWitness: boolean | null; humanJudgment: null; rubric: string }[];
    records: AuditRecord[]; usage: Broker["usage"]; qualityClaim: string;
}
export function checkCounterexample(value: unknown): boolean {
    const parsed = CounterexampleSchema.safeParse(value);
    if (!parsed.success) return false;
    const n = BigInt(parsed.data.n), factor = BigInt(parsed.data.factor), result = n * n + n + 41n;
    return factor > 1n && factor < result && result % factor === 0n;
}
export async function evaluate(worker: Worker, config: Config, options: { mode: "live" | "fixture"; label: string; signal?: AbortSignal; checkpoint?: (result: EvaluationResult) => Promise<void> }): Promise<EvaluationResult> {
    const report: EvaluationResult = { revision: EVALUATION_REVISION, mode: options.mode, label: options.label, startedAt: new Date().toISOString(), finishedAt: null, config, configHash: digest(config), tasksHash: digest(EVALUATION_TASKS), cases: [], records: [], usage: { calls: 0, reservedOutputTokens: 0, input: 0, output: 0, reportedCost: 0 }, qualityClaim: "None. Human adjudication is required; fixtures test the harness only. Exact witness checking covers one finite counterexample, not general proof validity." };
    const broker = new Broker(worker, config, async r => { report.records.push(r); }, options.signal);
    for (const task of EVALUATION_TASKS) {
        if (options.signal?.aborted) break;
        try {
            const schema: z.ZodType = task.kind === "review" ? ReviewSchema : task.kind === "proof" ? SectionSchema : CounterexampleSchema;
            const output = await broker.ask(task.role, task.instruction, task.input, schema);
            report.cases.push({ id: task.id, status: "returned", output, error: null, exactWitness: task.kind === "counterexample" ? checkCounterexample(output) : null, humanJudgment: null, rubric: task.rubric });
        } catch (e) {
            report.cases.push({ id: task.id, status: "error", output: null, error: e instanceof Error ? e.message : "Request failed", exactWitness: null, humanJudgment: null, rubric: task.rubric });
        }
        report.usage = { ...broker.usage };
        await options.checkpoint?.(report);
    }
    report.finishedAt = new Date().toISOString();
    await options.checkpoint?.(report);
    return report;
}
