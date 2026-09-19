import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hash } from "./store.ts";
import { variables, type Expr } from "./expressions.ts";
import type { Prover, ProofFeedback } from "./certificate.ts";
export function leanSource(expr: Expr, premises: readonly Expr[]): string {
    const names = [...new Set([...variables(expr), ...premises.flatMap(variables)])].sort();
    const index = new Map(names.map((name, i) => [name, `x${i}`]));
    function render(e: Expr): string {
        if (e.kind === "int")
            return `(${e.value} : Int)`;
        if (e.kind === "var")
            return index.get(e.name)!;
        if (e.kind === "not")
            return `(¬ ${render(e.arg)})`;
        const symbol = { add: "+", sub: "-", mul: "*", eq: "=", and: "∧", implies: "→" }[e.kind];
        return `(${render(e.left)} ${symbol} ${render(e.right)})`;
    }
    const quantified = names.length ? `∀ (${names.map(n => index.get(n)).join(" ")} : Int), ` : "";
    const goal = [...premises.map(render), render(expr)].join(" → ");
    return `import Mathlib\nset_option autoImplicit false\n\ntheorem piMathClaim : ${quantified}${goal} := by\n  intros\n  first | omega | (simp_all; ring_nf at *; omega)\n\n#print axioms piMathClaim\n`;
}
export interface ProcessResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
    problem: string | null;
}
export async function executeBounded(command: string, args: readonly string[], cwd: string, timeoutMs: number, signal?: AbortSignal, maxBytes = 128000): Promise<ProcessResult> {
    if (signal?.aborted)
        throw new Error("Research cancelled");
    return new Promise(resolve => {
        const start = Date.now();
        let stdout = "", stderr = "", bytes = 0, problem: string | null = null, finished = false;
        const child = spawn(command, [...args], { cwd, shell: false, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
        const kill = () => { try {
            if (child.pid && process.platform !== "win32")
                process.kill(-child.pid, "SIGKILL");
            else
                child.kill("SIGKILL");
        }
        catch { /* Already exited. */ } };
        const finish = (exitCode: number | null) => { if (finished)
            return; finished = true; clearTimeout(timer); signal?.removeEventListener("abort", cancel); resolve({ stdout, stderr, exitCode, durationMs: Date.now() - start, problem }); };
        const stop = (message: string) => { problem ??= message; kill(); };
        const timer = setTimeout(() => stop("Process timed out"), timeoutMs);
        const cancel = () => stop("Research cancelled");
        signal?.addEventListener("abort", cancel, { once: true });
        for (const [stream, key] of [[child.stdout, "stdout"], [child.stderr, "stderr"]] as const)
            stream.on("data", (chunk: Buffer) => {
                const available = Math.max(0, maxBytes - bytes);
                bytes += chunk.length;
                const text = chunk.subarray(0, available).toString("utf8");
                if (key === "stdout")
                    stdout += text;
                else
                    stderr += text;
                if (bytes > maxBytes)
                    stop("Process output limit exceeded");
            });
        child.on("error", error => { problem = error.message; finish(null); });
        child.on("close", code => finish(code));
    });
}
export function cleanLeanAxioms(stdout: string): boolean {
    if (/sorryAx|\bsorry\b|\badmit\b/.test(stdout))
        return false;
    if (/piMathClaim[^\n]*does not depend on any axioms/.test(stdout))
        return true;
    const match = /piMathClaim[^\n]*depends on axioms:\s*\[([^\]]*)\]/.exec(stdout);
    if (!match)
        return false;
    return match[1]!.split(",").map(s => s.trim()).filter(Boolean).every(s => ["propext", "Classical.choice", "Quot.sound"].includes(s));
}
/** Trusted locally configured Lake project. Generated source contains no model code. */
export class LeanProver implements Prover {
    constructor(readonly project: string, readonly timeoutMs = 30000, readonly executable = "lake") { }
    async prove(expr: Expr, premises: readonly Expr[], signal?: AbortSignal): Promise<ProofFeedback> {
        const source = leanSource(expr, premises), dir = await mkdtemp(join(tmpdir(), "pi-math-lean-"));
        try {
            const file = join(dir, "Claim.lean");
            await writeFile(file, source, { mode: 0o600 });
            const result = await executeBounded(this.executable, ["env", "lean", file], this.project, this.timeoutMs, signal);
            const checked = !result.problem && result.exitCode === 0 && cleanLeanAxioms(result.stdout);
            return { outcome: checked ? "lean-checked" : result.problem ? "error" : "unknown", rho: checked ? 1 : 0, statementHash: hash(expr), premisesHash: hash(premises),
                explanation: checked ? "Lean accepted the deterministic integer goal and its reported axioms are allowlisted" : result.problem ?? "Lean did not certify this goal; this is not a counterexample",
                execution: { sourceHash: hash(source), stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, durationMs: result.durationMs } };
        }
        finally {
            await rm(dir, { recursive: true, force: true });
        }
    }
}
