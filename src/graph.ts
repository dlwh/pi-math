import type { ProofPlan, Progress } from "./schema.ts";
export function validatePlan(plan: ProofPlan, obligations: readonly string[] = []): void {
    const ids = new Set(plan.sections.map(s => s.id));
    if (ids.size !== plan.sections.length)
        throw new Error("Duplicate section IDs");
    if (!ids.has(plan.conclusionId))
        throw new Error("Unknown conclusion section");
    for (const s of plan.sections) {
        if (new Set(s.dependsOn).size !== s.dependsOn.length)
            throw new Error("Duplicate dependencies");
        for (const d of s.dependsOn)
            if (!ids.has(d))
                throw new Error(`Missing dependency ${d}`);
    }
    const visiting = new Set<string>(), visited = new Set<string>();
    const byId = new Map(plan.sections.map(s => [s.id, s]));
    function visit(id: string) {
        if (visiting.has(id))
            throw new Error("Proof dependency cycle");
        if (visited.has(id))
            return;
        visiting.add(id);
        for (const dep of byId.get(id)!.dependsOn)
            visit(dep);
        visiting.delete(id);
        visited.add(id);
    }
    for (const id of ids)
        visit(id);
    const used = new Set<string>();
    function mark(id: string) { if (used.has(id))
        return; used.add(id); byId.get(id)!.dependsOn.forEach(mark); }
    mark(plan.conclusionId);
    if (used.size !== ids.size)
        throw new Error("Every section must contribute to the conclusion");
    const assigned = new Set(plan.sections.flatMap(s => s.obligations));
    for (const id of obligations)
        if (!assigned.has(id))
            throw new Error(`Unassigned obligation ${id}`);
    for (const id of assigned)
        if (!obligations.includes(id))
            throw new Error(`Unknown obligation ${id}`);
}
export function descendants(plan: ProofPlan, changed: Iterable<string>): Set<string> {
    const affected = new Set(changed);
    let expanded = true;
    while (expanded) {
        expanded = false;
        for (const s of plan.sections)
            if (!affected.has(s.id) && s.dependsOn.some(d => affected.has(d))) {
                affected.add(s.id);
                expanded = true;
            }
    }
    return affected;
}
export function emptyProgress(): Progress {
    return { status: "pending", attempts: 0, candidate: null, previous: [], failure: null };
}
export function reviseGraph(old: ProofPlan, next: ProofPlan, progress: Record<string, Progress>, changed: readonly string[]): Record<string, Progress> {
    const dirty = new Set(changed);
    for (const section of next.sections) {
        const before = old.sections.find(s => s.id === section.id);
        if (!before || JSON.stringify(before) !== JSON.stringify(section))
            dirty.add(section.id);
    }
    for (const section of old.sections)
        if (!next.sections.some(s => s.id === section.id))
            dirty.add(section.id);
    const affected = descendants(next, descendants(old, dirty));
    return Object.fromEntries(next.sections.map(s => {
        const before = progress[s.id];
        if (before && !affected.has(s.id))
            return [s.id, structuredClone(before)];
        return [s.id, { ...emptyProgress(), previous: before ? [...before.previous, ...(before.candidate ? [before.candidate] : [])] : [] }];
    }));
}
export function frontier(plan: ProofPlan, progress: Record<string, Progress>): string[] {
    return plan.sections.filter(s => progress[s.id]?.status !== "accepted" && s.dependsOn.every(d => progress[d]?.status === "accepted")).map(s => s.id);
}
