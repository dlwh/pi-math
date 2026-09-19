import { z } from "zod";
import { hash } from "./store.ts";
export type Expr = {
    kind: "int";
    value: number;
} | {
    kind: "var";
    name: string;
} | {
    kind: "not";
    arg: Expr;
} | {
    kind: "add" | "sub" | "mul" | "eq" | "and" | "implies";
    left: Expr;
    right: Expr;
};
export const FeatureName = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/);
export const ExprSchema: z.ZodType<Expr> = z.lazy(() => z.union([
    z.object({ kind: z.literal("int"), value: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER) }).strict(),
    z.object({ kind: z.literal("var"), name: FeatureName }).strict(),
    z.object({ kind: z.literal("not"), arg: ExprSchema }).strict(),
    z.object({ kind: z.enum(["add", "sub", "mul", "eq", "and", "implies"]), left: ExprSchema, right: ExprSchema }).strict(),
]));
export function parseExpr(value: unknown, features: readonly string[]): Expr {
    // Bound depth before recursive schema parsing or evaluation.
    const pending: {
        value: unknown;
        depth: number;
    }[] = [{ value, depth: 0 }];
    let count = 0;
    while (pending.length) {
        const current = pending.pop()!;
        if (++count > 127 || current.depth > 20)
            throw new Error("Expression exceeds complexity limit");
        if (current.value && typeof current.value === "object")
            for (const key of ["arg", "left", "right"]) {
                const child = (current.value as Record<string, unknown>)[key];
                if (child !== undefined)
                    pending.push({ value: child, depth: current.depth + 1 });
            }
    }
    const expr = ExprSchema.parse(value);
    typeOf(expr, features);
    return expr;
}
export function typeOf(expr: Expr, features: readonly string[]): "integer" | "boolean" {
    if (expr.kind === "int")
        return "integer";
    if (expr.kind === "var") {
        if (!features.includes(expr.name))
            throw new Error(`Unknown feature ${expr.name}`);
        return "integer";
    }
    if (expr.kind === "not") {
        if (typeOf(expr.arg, features) !== "boolean")
            throw new Error("Negation needs a proposition");
        return "boolean";
    }
    const left = typeOf(expr.left, features), right = typeOf(expr.right, features);
    const need = ["and", "implies"].includes(expr.kind) ? "boolean" : "integer";
    if (left !== need || right !== need)
        throw new Error(`Ill-typed ${expr.kind}`);
    return ["eq", "and", "implies"].includes(expr.kind) ? "boolean" : "integer";
}
export function evaluate(expr: Expr, values: Readonly<Record<string, number>>): bigint | boolean {
    if (expr.kind === "int")
        return BigInt(expr.value);
    if (expr.kind === "var") {
        if (!Object.hasOwn(values, expr.name) || !Number.isSafeInteger(values[expr.name]))
            throw new Error(`Missing or unsafe feature ${expr.name}`);
        return BigInt(values[expr.name]!);
    }
    if (expr.kind === "not") {
        const x = evaluate(expr.arg, values);
        if (typeof x !== "boolean")
            throw new Error("Ill-typed not");
        return !x;
    }
    const left = evaluate(expr.left, values), right = evaluate(expr.right, values);
    if (expr.kind === "and" || expr.kind === "implies") {
        if (typeof left !== "boolean" || typeof right !== "boolean")
            throw new Error("Ill-typed connective");
        return expr.kind === "and" ? left && right : !left || right;
    }
    if (typeof left !== "bigint" || typeof right !== "bigint")
        throw new Error("Ill-typed arithmetic");
    switch (expr.kind) {
        case "add": return left + right;
        case "sub": return left - right;
        case "mul": return left * right;
        case "eq": return left === right;
    }
}
export function canonical(expr: Expr): string {
    if (expr.kind === "int")
        return `n:${expr.value}`;
    if (expr.kind === "var")
        return `v:${expr.name}`;
    if (expr.kind === "not")
        return `not(${canonical(expr.arg)})`;
    const children = [canonical(expr.left), canonical(expr.right)];
    if (["add", "mul", "eq", "and"].includes(expr.kind))
        children.sort();
    return `${expr.kind}(${children.join(",")})`;
}
export function formatExpr(expr: Expr): string {
    if (expr.kind === "int")
        return String(expr.value);
    if (expr.kind === "var")
        return expr.name;
    if (expr.kind === "not")
        return `¬(${formatExpr(expr.arg)})`;
    const op = { add: "+", sub: "−", mul: "×", eq: "=", and: "∧", implies: "⇒" }[expr.kind];
    return `(${formatExpr(expr.left)} ${op} ${formatExpr(expr.right)})`;
}
export function size(expr: Expr): number { return expr.kind === "int" || expr.kind === "var" ? 1 : expr.kind === "not" ? 1 + size(expr.arg) : 1 + size(expr.left) + size(expr.right); }
export function variables(expr: Expr): string[] {
    if (expr.kind === "var")
        return [expr.name];
    if (expr.kind === "int")
        return [];
    return [...new Set(expr.kind === "not" ? variables(expr.arg) : [...variables(expr.left), ...variables(expr.right)])].sort();
}
export function statementHash(expr: Expr): string { return hash(expr); }
/** Propositional tautology check treats each distinct equality as an atom. */
export function tautology(expr: Expr): boolean {
    const atoms = new Set<string>();
    function collect(e: Expr) { if (e.kind === "eq") {
        atoms.add(canonical(e));
        return;
    } if (e.kind === "not")
        collect(e.arg);
    else if (e.kind === "and" || e.kind === "implies") {
        collect(e.left);
        collect(e.right);
    } }
    collect(expr);
    if (atoms.size > 10)
        return false;
    const ids = [...atoms];
    function truth(e: Expr, mask: number): boolean {
        if (e.kind === "eq")
            return Boolean(mask & (1 << ids.indexOf(canonical(e))));
        if (e.kind === "not")
            return !truth(e.arg, mask);
        if (e.kind === "and")
            return truth(e.left, mask) && truth(e.right, mask);
        if (e.kind === "implies")
            return !truth(e.left, mask) || truth(e.right, mask);
        throw new Error("Expected proposition");
    }
    for (let mask = 0; mask < 2 ** ids.length; mask++)
        if (!truth(expr, mask))
            return false;
    return true;
}
export const v = (name: string): Expr => ({ kind: "var", name });
export const n = (value: number): Expr => ({ kind: "int", value });
export const op = (kind: "add" | "sub" | "mul" | "eq" | "and" | "implies", left: Expr, right: Expr): Expr => ({ kind, left, right });
