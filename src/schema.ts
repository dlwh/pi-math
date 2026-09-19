import { z } from "zod";
export const Text = z.string().trim().min(1).max(60000);
export const Id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/);
export const Strings = z.array(Text).max(100);
export const Severity = z.enum(["minor", "major", "fatal"]);
export const IssueSchema = z.object({
    claim: Text, reason: Text, severity: Severity,
    scope: z.enum(["artifact", "target", "strategy", "section"]),
    sections: z.array(Id).max(100),
}).strict();
export const ObjectionSchema = IssueSchema.extend({ id: Id, source: Id });
export type Objection = z.infer<typeof ObjectionSchema>;
export const ResolutionSchema = z.object({ id: Id, reason: Text }).strict();
export const ReviewSchema = z.object({
    verdict: z.enum(["accept", "revise", "reject"]),
    summary: Text, issues: z.array(IssueSchema).max(100),
    resolved: z.array(ResolutionSchema).max(100),
}).strict();
export type Review = z.infer<typeof ReviewSchema>;
export function bundleSchema<T extends z.ZodType>(value: T) {
    return z.object({
        id: Id, value, objections: z.array(ObjectionSchema),
        reviews: z.array(z.object({ id: Id, review: ReviewSchema }).strict()),
        parents: z.array(Id),
    }).strict();
}
export interface Bundle<T> {
    id: string;
    value: T;
    objections: Objection[];
    reviews: {
        id: string;
        review: Review;
    }[];
    parents: string[];
}
export const ObligationSchema = z.object({
    id: Id, statement: Text, severity: Severity, path: Text,
}).strict();
export const StrategySchema = z.object({
    target: Text, mechanism: Text, hypotheses: Strings,
    lemmas: Strings, bottleneck: Text,
    gateway: z.object({ test: Text, ifPass: Text, ifFail: Text }).strict(),
    alternatives: z.array(Text).max(2),
    obligations: z.array(ObligationSchema).max(100),
    evidence: Strings,
}).strict();
export type Strategy = z.infer<typeof StrategySchema>;
export const GateSchema = z.object({
    decision: z.enum(["ready", "with-obligations", "explore", "reject"]),
    stableArchitecture: z.boolean(), reason: Text,
    obligations: z.array(ObligationSchema).max(100),
}).strict();
export type Gate = z.infer<typeof GateSchema>;
export const TaskSchema = z.object({
    id: Id, title: Text, task: Text, dependsOn: z.array(Id).max(100),
    obligations: z.array(Id).max(100),
}).strict();
export type ProofTask = z.infer<typeof TaskSchema>;
export const PlanSchema = z.object({
    title: Text, abstract: Text, conclusionId: Id,
    sections: z.array(TaskSchema).min(1).max(64),
}).strict();
export type ProofPlan = z.infer<typeof PlanSchema>;
export const SectionSchema = z.object({
    body: Text, claimedResult: Text,
    status: z.enum(["complete", "partial", "blocked"]),
    assumptions: Strings, usedDependencies: z.array(Id).max(64),
    gaps: Strings,
}).strict();
export type Section = z.infer<typeof SectionSchema>;
export const VerificationSchema = z.object({
    verdict: z.enum(["accept", "revise", "reexplore"]),
    summary: Text,
    defects: z.array(IssueSchema).max(100),
}).strict();
export type Verification = z.infer<typeof VerificationSchema>;
export const RevisionSchema = z.object({
    action: z.enum(["sections", "outline", "reexplore"]),
    reason: Text, affected: z.array(Id).max(64),
    plan: PlanSchema.nullable(),
}).strict();
export type Revision = z.infer<typeof RevisionSchema>;
export const KnowledgeSchema = z.object({
    id: Id, kind: z.enum(["lemma", "failure", "reference", "observation"]),
    statement: Text, hypotheses: Strings,
    status: z.enum(["unverified", "model-reviewed", "computed", "human-reviewed"]),
    sources: Strings.min(1), caveats: Strings,
}).strict();
export type Knowledge = z.infer<typeof KnowledgeSchema>;
/** Defaults are resolved at dispatch so old checkpoints retain their meaning. */
export const GenerationSchema = z.object({
    reasoning: z.union([z.enum(["auto", "default", "off", "minimal", "low", "medium", "high", "xhigh", "max"]), z.number().int().min(1).max(100)]).optional(),
    maxOutputTokens: z.number().int().min(128).max(524288).optional(),
    contextWindow: z.number().int().min(1024).max(2000000).optional(),
    thinkingBudget: z.number().int().min(128).max(523264).optional(),
    finalAnswerReserve: z.number().int().min(128).max(32768).optional(),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
    topK: z.number().int().min(0).max(1000).optional(),
    minP: z.number().min(0).max(1).optional(),
    structuredOutput: z.enum(["prompt", "json-schema"]).optional(),
}).strict();
export type Generation = z.infer<typeof GenerationSchema>;
/** More specific fields override less specific fields; model selection remains separate. */
export function generationFor(config: Config, role: string): Generation {
    const [stage, suffix] = role.split("/");
    return Object.assign({}, config.generation.default, config.generation[stage!], suffix ? config.generation[suffix] : undefined, config.generation[role]);
}
export const ConfigSchema = z.object({
    widths: z.array(z.number().int().min(1).max(128)).min(1).max(8).default([4, 2, 1]),
    sampleSize: z.number().int().min(1).max(128).default(3),
    reviewers: z.number().int().min(1).max(4).default(1),
    concurrency: z.number().int().min(1).max(16).default(3),
    maxCalls: z.number().int().min(1).max(10000).default(160),
    maxOutputTokens: z.number().int().min(128).max(524288).default(4096),
    maxReservedOutputTokens: z.number().int().min(128).max(100000000).default(655360),
    maxInputChars: z.number().int().min(1000).max(2000000).default(240000),
    timeoutMs: z.number().int().min(10).max(900000).default(120000),
    maxSectionAttempts: z.number().int().min(1).max(20).default(3),
    maxRounds: z.number().int().min(1).max(100).default(5),
    seed: z.number().int().min(0).max(0xffffffff).default(1729),
    models: z.record(z.string(), z.object({ provider: Text, id: Text }).strict()).default({}),
    generation: z.record(z.string(), GenerationSchema).default({}),
    localOnly: z.boolean().default(false),
}).strict().refine(c => c.widths.at(-1) === 1, "The aggregation tree must end in one root");
export type Config = z.infer<typeof ConfigSchema>;
export const DEFAULT_CONFIG = ConfigSchema.parse({});
export const ProgressSchema = z.object({
    status: z.enum(["pending", "accepted", "failed"]),
    attempts: z.number().int().nonnegative(),
    candidate: bundleSchema(SectionSchema).nullable(),
    previous: z.array(bundleSchema(SectionSchema)),
    failure: z.string().nullable(),
}).strict();
export type Progress = z.infer<typeof ProgressSchema>;
export const StateSchema = z.object({
    version: z.literal(1), id: Id, revision: z.number().int().nonnegative(),
    createdAt: Text, problem: Text, assumptions: Strings,
    phase: z.enum(["explore", "gate", "awaiting-route", "decompose", "awaiting-plan", "solve", "verify", "revise", "awaiting-acceptance", "accepted", "blocked"]),
    round: z.number().int().nonnegative(),
    config: ConfigSchema,
    strategy: bundleSchema(StrategySchema).nullable(),
    gate: bundleSchema(GateSchema).nullable(),
    plan: PlanSchema.nullable(),
    sections: z.record(Id, ProgressSchema),
    verification: bundleSchema(VerificationSchema).nullable(),
    knowledge: z.array(KnowledgeSchema),
    archives: z.array(z.object({
        round: z.number().int(), problem: Text, draft: z.string(),
        strategy: bundleSchema(StrategySchema).nullable(),
        verification: bundleSchema(VerificationSchema).nullable(),
    }).strict()),
    decisions: z.array(z.object({
        kind: z.enum(["route", "plan", "accept", "amend", "retry", "reexplore", "premise"]),
        artifactHash: Text, reason: Text, at: Text,
    }).strict()),
    failure: z.string().nullable(),
}).strict();
export type ResearchState = z.infer<typeof StateSchema>;
export function parseJson<T>(raw: string, schema: z.ZodType<T>): T {
    const trimmed = raw.trim();
    const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(trimmed);
    return schema.parse(JSON.parse(fenced ? fenced[1]! : trimmed));
}
export function serious(objections: readonly Objection[]): boolean {
    return objections.some(o => o.severity !== "minor");
}
