import { z } from "zod";
import { StateSchema, ConfigSchema, type ResearchState } from "./schema.ts";
import { ObjectStore, type BranchEntry } from "./store.ts";
import { DatasetSchema, ControlsSchema, parseDataset, checkedFeedback, type DiscoveryState } from "./discovery.ts";
import { ExprSchema, parseExpr } from "./expressions.ts";
import type { CertificateTree } from "./certificate.ts";
const Address = z.string().regex(/^[a-f0-9]{64}$/);
const CertificateTreeSchema: z.ZodType<CertificateTree> = z.lazy(() => z.union([
    z.object({ kind: z.literal("linear"), weights: z.array(z.string().max(10000)).max(160) }).strict(),
    z.object({ kind: z.literal("and"), left: CertificateTreeSchema, right: CertificateTreeSchema }).strict(),
    z.object({ kind: z.literal("implies"), consequent: CertificateTreeSchema }).strict(),
]));
const FeedbackSchema = z.object({
    outcome: z.enum(["certified", "lean-checked", "unknown", "error"]), rho: z.union([z.literal(0), z.literal(1)]), statementHash: Address, premisesHash: Address, explanation: z.string(),
    certificate: z.object({ version: z.literal(1), statementHash: Address, premisesHash: Address, tree: CertificateTreeSchema }).strict().optional(),
    execution: z.object({ sourceHash: Address, stdout: z.string(), stderr: z.string(), exitCode: z.number().nullable(), durationMs: z.number().nonnegative() }).strict().optional(),
}).strict();
const DiscoverySchema = z.object({
    version: z.literal(1), id: z.string().uuid(), dataset: DatasetSchema,
    rounds: z.array(z.object({
        index: z.number().int().nonnegative(), premises: z.array(ExprSchema), weightsBefore: DatasetSchema.shape.patches, weightsAfter: DatasetSchema.shape.patches,
        controls: ControlsSchema, atoms: z.array(z.object({ id: z.string(), expression: ExprSchema, description: z.string(), patch: z.string(), accuracy: z.number().min(0).max(1) }).strict()),
        conjecture: ExprSchema, rationale: z.string(),
        evidence: z.object({ tested: z.number().int().nonnegative(), counterexamples: z.array(z.string()), allDataTrue: z.boolean(), accuracy: z.number().min(0).max(1), nondegenerate: z.boolean(), reasons: z.array(z.string()) }).strict(),
        proof: FeedbackSchema, reward: z.object({ conjecturer: z.number().finite(), skeptic: z.number().finite() }).strict(), skepticReason: z.string(),
    }).strict()).max(50),
    definitions: z.array(z.object({ name: z.string(), expression: ExprSchema, meaning: z.string(), round: z.number().int().nonnegative() }).strict()),
    controls: ControlsSchema, status: z.enum(["active", "candidate-found", "exhausted"]), maxRounds: z.number().int().min(1).max(50),
    ablations: z.object({ dynamicData: z.boolean(), proofFeedback: z.boolean(), controller: z.boolean() }).strict(),
}).strict();
export const SettingsSchema = z.object({
    inference: ConfigSchema.default(() => ConfigSchema.parse({})),
    discoveryPolicy: z.enum(["model", "symbolic"]).default("model"),
    discoveryRounds: z.number().int().min(1).max(50).default(10),
    lean: z.object({ project: z.string().min(1), timeoutMs: z.number().int().min(100).max(300000).default(30000) }).strict().nullable().default(null),
}).strict();
export type Settings = z.infer<typeof SettingsSchema>;
const WorkbenchSchema = z.object({
    version: z.literal(1), proof: StateSchema.nullable(), discovery: DiscoverySchema.nullable(), settings: SettingsSchema,
    audit: z.array(Address), artifacts: z.array(Address), evidence: z.array(Address), pastRuns: z.array(Address),
    humanEvents: z.array(z.object({ action: z.string(), reason: z.string(), at: z.string(), artifactHash: Address }).strict()),
}).strict();
export interface Workbench {
    version: 1;
    proof: ResearchState | null;
    discovery: DiscoveryState | null;
    settings: Settings;
    audit: string[];
    artifacts: string[];
    evidence: string[];
    pastRuns: string[];
    humanEvents: {
        action: string;
        reason: string;
        at: string;
        artifactHash: string;
    }[];
}
export function emptyWorkbench(): Workbench { return { version: 1, proof: null, discovery: null, settings: SettingsSchema.parse({}), audit: [], artifacts: [], evidence: [], pastRuns: [], humanEvents: [] }; }
export function parseWorkbench(raw: unknown): Workbench {
    const w = WorkbenchSchema.parse(raw) as Workbench;
    if (w.discovery) {
        const d = w.discovery;
        parseDataset(d.dataset);
        for (const round of d.rounds) {
            parseExpr(round.conjecture, d.dataset.features);
            round.premises.forEach(p => parseExpr(p, d.dataset.features));
            checkedFeedback(round.conjecture, round.premises, round.proof);
        }
        if (d.status === "candidate-found" && !(d.rounds.at(-1)?.proof.rho === 1 && d.rounds.at(-1)?.evidence.nondegenerate))
            throw new Error("Invalid discovery termination claim");
    }
    return w;
}
export const WORKBENCH_TYPE = "pi-math/workbench-v1";
export async function restoreWorkbench(store: ObjectStore, branch: readonly BranchEntry[]): Promise<Workbench> {
    const entry = [...branch].reverse().find(e => e.type === "custom" && e.customType === WORKBENCH_TYPE);
    if (!entry)
        return emptyWorkbench();
    const ref = z.object({ version: z.literal(1), hash: Address }).strict().parse(entry.data);
    return parseWorkbench(await store.get(ref.hash));
}
