import { hash } from "./store.ts";
import { variables, type Expr } from "./expressions.ts";
// Exact rational arithmetic. All public serialization uses decimal strings.
type Q = {
    n: bigint;
    d: bigint;
};
const abs = (n: bigint) => n < 0n ? -n : n;
function gcd(a: bigint, b: bigint): bigint { while (b) {
    [a, b] = [b, a % b];
} return abs(a); }
function q(n: bigint, d = 1n): Q { if (!d)
    throw new Error("Zero denominator"); const g = gcd(n, d); const sign = d < 0n ? -1n : 1n; return { n: sign * n / g, d: sign * d / g }; }
const zero = () => q(0n), one = () => q(1n);
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const neg = (a: Q) => q(-a.n, a.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const encode = (a: Q) => `${a.n}/${a.d}`;
function decode(s: string): Q { if (typeof s !== "string" || s.length > 10000 || !/^\-?\d+\/[1-9]\d*$/.test(s))
    throw new Error("Invalid rational certificate"); const [a, b] = s.split("/"); return q(BigInt(a!), BigInt(b!)); }
type Linear = Map<string, bigint>;
function plus(a: Linear, b: Linear, scale = 1n): Linear { const out = new Map(a); for (const [k, v] of b) {
    const n = (out.get(k) ?? 0n) + v * scale;
    if (n)
        out.set(k, n);
    else
        out.delete(k);
} return out; }
export function linear(expr: Expr): Linear | null {
    if (expr.kind === "int")
        return expr.value ? new Map([["", BigInt(expr.value)]]) : new Map();
    if (expr.kind === "var")
        return new Map([[expr.name, 1n]]);
    if (!["add", "sub", "mul"].includes(expr.kind) || !("left" in expr))
        return null;
    const a = linear(expr.left), b = linear(expr.right);
    if (!a || !b)
        return null;
    if (expr.kind === "add")
        return plus(a, b);
    if (expr.kind === "sub")
        return plus(a, b, -1n);
    if ([...a.keys()].every(k => k === ""))
        return new Map([...b].map(([k, v]) => [k, v * (a.get("") ?? 0n)]));
    if ([...b.keys()].every(k => k === ""))
        return new Map([...a].map(([k, v]) => [k, v * (b.get("") ?? 0n)]));
    return null;
}
function equality(expr: Expr): Linear | null { if (expr.kind !== "eq")
    return null; const a = linear(expr.left), b = linear(expr.right); return a && b ? plus(a, b, -1n) : null; }
function assumptions(expr: Expr): Linear[] {
    if (expr.kind === "and")
        return [...assumptions(expr.left), ...assumptions(expr.right)];
    const row = equality(expr);
    return row ? [row] : [];
}
export type CertificateTree = {
    kind: "linear";
    weights: string[];
} | {
    kind: "and";
    left: CertificateTree;
    right: CertificateTree;
} | {
    kind: "implies";
    consequent: CertificateTree;
};
export interface Certificate {
    version: 1;
    statementHash: string;
    premisesHash: string;
    tree: CertificateTree;
}
function solveSpan(rows: Linear[], target: Linear): string[] | null {
    const keys = [...new Set([...rows.flatMap(r => [...r.keys()]), ...target.keys()])];
    const matrix = keys.map(k => [...rows.map(r => q(r.get(k) ?? 0n)), q(target.get(k) ?? 0n)]);
    const pivots: {
        column: number;
        row: number;
    }[] = [];
    let pivot = 0;
    for (let column = 0; column < rows.length && pivot < matrix.length; column++) {
        const found = matrix.findIndex((r, i) => i >= pivot && r[column]!.n !== 0n);
        if (found < 0)
            continue;
        [matrix[pivot], matrix[found]] = [matrix[found]!, matrix[pivot]!];
        const divisor = matrix[pivot]![column]!;
        matrix[pivot] = matrix[pivot]!.map(x => div(x, divisor));
        for (let i = 0; i < matrix.length; i++)
            if (i !== pivot) {
                const factor = matrix[i]![column]!;
                matrix[i] = matrix[i]!.map((x, j) => add(x, neg(mul(factor, matrix[pivot]![j]!))));
            }
        pivots.push({ column, row: pivot });
        pivot++;
    }
    if (matrix.some(r => r.slice(0, -1).every(x => !x.n) && r.at(-1)!.n !== 0n))
        return null;
    const solution = rows.map(zero);
    for (const p of pivots)
        solution[p.column] = matrix[p.row]!.at(-1)!;
    return solution.map(encode);
}
function produce(expr: Expr, rows: Linear[]): CertificateTree | null {
    if (expr.kind === "and") {
        const left = produce(expr.left, rows), right = produce(expr.right, rows);
        return left && right ? { kind: "and", left, right } : null;
    }
    if (expr.kind === "implies") {
        const consequent = produce(expr.right, [...rows, ...assumptions(expr.left)]);
        return consequent ? { kind: "implies", consequent } : null;
    }
    const goal = equality(expr);
    if (!goal)
        return null;
    const weights = solveSpan(rows, goal);
    return weights ? { kind: "linear", weights } : null;
}
export function certify(expr: Expr, premises: readonly Expr[]): Certificate | null {
    const tree = produce(expr, premises.flatMap(assumptions));
    if (!tree)
        return null;
    const certificate: Certificate = { version: 1, statementHash: hash(expr), premisesHash: hash(premises), tree };
    if (!verifyCertificate(expr, premises, certificate))
        throw new Error("Internal certificate verification failed");
    return certificate;
}
/** Independent checker: never calls the Gaussian-elimination producer. */
export function verifyCertificate(expr: Expr, premises: readonly Expr[], certificate: Certificate): boolean {
    try {
        if (certificate.version !== 1 || certificate.statementHash !== hash(expr) || certificate.premisesHash !== hash(premises))
            return false;
        function check(e: Expr, rows: Linear[], tree: CertificateTree): boolean {
            if (e.kind === "and")
                return tree.kind === "and" && check(e.left, rows, tree.left) && check(e.right, rows, tree.right);
            if (e.kind === "implies")
                return tree.kind === "implies" && check(e.right, [...rows, ...assumptions(e.left)], tree.consequent);
            const goal = equality(e);
            if (!goal || tree.kind !== "linear" || tree.weights.length !== rows.length)
                return false;
            const weights = tree.weights.map(decode);
            const keys = new Set([...rows.flatMap(r => [...r.keys()]), ...goal.keys()]);
            for (const k of keys) {
                let sum = zero();
                for (let i = 0; i < rows.length; i++)
                    sum = add(sum, mul(weights[i]!, q(rows[i]!.get(k) ?? 0n)));
                if (sum.n !== BigInt(goal.get(k) ?? 0n) * sum.d)
                    return false;
            }
            return true;
        }
        return check(expr, premises.flatMap(assumptions), certificate.tree);
    }
    catch {
        return false;
    }
}
export interface ProofFeedback {
    outcome: "certified" | "lean-checked" | "unknown" | "error";
    rho: 0 | 1;
    statementHash: string;
    premisesHash: string;
    explanation: string;
    certificate?: Certificate;
    execution?: {
        sourceHash: string;
        stdout: string;
        stderr: string;
        exitCode: number | null;
        durationMs: number;
    };
}
export interface Prover {
    prove(expr: Expr, premises: readonly Expr[], signal?: AbortSignal): Promise<ProofFeedback>;
}
export class AlgebraProver implements Prover {
    async prove(expr: Expr, premises: readonly Expr[], signal?: AbortSignal): Promise<ProofFeedback> {
        if (signal?.aborted)
            throw new Error("Research cancelled");
        if (variables(expr).length > 24 || premises.length > 32)
            throw new Error("Algebra problem exceeds limits");
        const certificate = certify(expr, premises);
        return { outcome: certificate ? "certified" : "unknown", rho: certificate ? 1 : 0, statementHash: hash(expr), premisesHash: hash(premises),
            explanation: certificate ? "Exact rational linear-combination certificate checked against the stated integer formula and premises" : "No certificate found in the supported linear-equality fragment; this is not evidence of falsity", ...(certificate ? { certificate } : {}) };
    }
}
