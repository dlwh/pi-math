import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ObjectStore } from "./store.ts";
import type { Workbench } from "./workbench.ts";
import { draft } from "./proof.ts";
import { formatExpr } from "./expressions.ts";

export function summary(w:Workbench):string{
  const p=w.proof,d=w.discovery;
  const parts=["Pi Math — research status"];
  if(p){
    parts.push(`Target: ${p.problem}`,`Phase: ${p.phase}; round ${p.round}; revision ${p.revision}`);
    if(p.failure)parts.push(`Last interruption: ${p.failure}`);
    if(p.strategy)parts.push(`Route: ${p.strategy.value.mechanism}`);
    if(p.gate)parts.push(`Readiness: ${p.gate.value.reason}`);
    if(p.plan)parts.push("Sections:",...p.plan.sections.map(s=>`- ${s.id}: ${s.title} — ${p.sections[s.id]?.status??"pending"}; depends on ${s.dependsOn.join(", ")||"none"}`));
    const objections=[...(p.strategy?.objections??[]),...(p.gate?.objections??[]),...(p.verification?.objections??[])];
    if(objections.length)parts.push("Open objections:",...objections.map(o=>`- [${o.severity}] ${o.id}: ${o.claim} — ${o.reason}`));
    if(p.verification)parts.push(`Global model review: ${p.verification.value.verdict} — ${p.verification.value.summary}`);
    parts.push(p.phase==="accepted"?"Human acceptance recorded. This does not imply a formal proof certificate.":"No final human acceptance is recorded for the current argument.");
  }else parts.push("No proof project. Start with /math start <question>.");
  if(d){
    parts.push(`Discovery: ${d.status}; ${d.rounds.length}/${d.maxRounds} rounds; ${d.dataset.rows.length} rows`);
    const last=d.rounds.at(-1);
    if(last)parts.push(`Conjecture: ${formatExpr(last.conjecture)}`,`Evidence: ${last.proof.outcome}; ${last.evidence.counterexamples.length} counterexamples; ${last.evidence.nondegenerate?"nondegenerate":"blocked by "+last.evidence.reasons.join(", ")}`);
  }
  parts.push(`Audit: ${w.audit.length} model calls; ${w.artifacts.length} inference artifacts; ${w.evidence.length} executed checks.`);
  return parts.join("\n");
}
export function markdown(w:Workbench):string{
  const p=w.proof;
  let output=`# Pi Math research dossier\n\n${summary(w)}\n\n`;
  if(p){
    output+=`## Explicit assumptions\n\n${p.assumptions.map(x=>`- ${x}`).join("\n")||"See the exact target statement; no additional assumptions declared."}\n\n## Current proof draft\n\n${draft(p)||"No proof draft yet."}\n\n`;
    output+=`## Section audit\n\n${p.plan?.sections.map(task=>{
      const item=p.sections[task.id]!;return `### ${task.id}\n\nTask: ${task.task}\n\nStatus: ${item.status}; attempts: ${item.attempts}\n\nGaps: ${item.candidate?.value.gaps.join("; ")||"None reported (not a guarantee)"}\n\n${item.candidate?.objections.map(o=>`- ${o.id}: ${o.reason}`).join("\n")??""}`;
    }).join("\n\n")??"No sections."}\n\n`;
    output+=`## Research knowledge\n\n${p.knowledge.map(k=>`### ${k.kind}: ${k.id}\n\n${k.statement}\n\nHypotheses: ${k.hypotheses.join("; ")||"None specified"}\n\nEvidence status: ${k.status}\n\nSources: ${k.sources.join(", ")}\n\nCaveats: ${k.caveats.join("; ")||"None supplied"}`).join("\n\n")}\n\n`;
    output+=`## Previous attempts\n\n${p.archives.map(a=>`### Round ${a.round}: ${a.problem}\n\n${a.draft||a.strategy?.value.mechanism||"No draft"}\n\nReview: ${a.verification?.value.summary??"Not globally reviewed"}`).join("\n\n")}\n\n`;
    output+=`## Human decisions\n\n${p.decisions.map(d=>`- ${d.at}: ${d.kind} — ${d.reason} (artifact ${d.artifactHash})`).join("\n")}\n\n`;
  }
  if(w.discovery){
    output+=`## Discovery trajectory\n\n${w.discovery.rounds.map(r=>`### Round ${r.index+1}\n\n${formatExpr(r.conjecture)}\n\n${r.rationale}\n\nProver: ${r.proof.outcome} — ${r.proof.explanation}\n\nExact data counterexamples: ${r.evidence.counterexamples.join(", ")||"None found"}\n\nSkeptic: ${r.skepticReason}\n\nStatement hash: ${r.proof.statementHash}\n\nPremises hash: ${r.proof.premisesHash}`).join("\n\n")}\n\n`;
  }
  return output+"## Reproducibility\n\nThe adjacent JSON includes state, complete model requests and responses, sampled aggregation ancestry, proof evidence, and prior-run references. Model reviews can share errors; inspect hypotheses, conjecture translations and proof certificates independently.\n";
}
function texEscape(value:string):string{return value.replace(/[\\{}$&#_%~^]/g,c=>({"\\":"\\textbackslash{}","{":"\\{","}":"\\}","$":"\\$","&":"\\&","#":"\\#","_":"\\_","%":"\\%","~":"\\textasciitilde{}","^":"\\textasciicircum{}"}[c]!));}
export function latex(w:Workbench):string{
  const p=w.proof;
  return `\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\begin{document}\n\\section*{Pi Math research draft}\nThis is a research draft. Evidence and review status are in the accompanying dossier.\n\n${texEscape(p?.problem??"No proof target")}\n\n${p?.plan?.sections.map(s=>`\\section{${texEscape(s.title)}}\n${p.sections[s.id]?.candidate?.value.body??texEscape("Unfinished: "+s.task)}`).join("\n\n")??""}\n\\end{document}\n`;
}
export async function exportWorkbench(store:ObjectStore,w:Workbench,write:(path:string,text:string)=>Promise<void>=async(path,text)=>{await writeFile(path,text,{flag:"wx",mode:0o600});}):Promise<string>{
  await store.initialize();const dir=await mkdtemp(join(store.root,"export-"));
  const load=async(refs:string[])=>Promise.all(refs.map(async key=>({hash:key,value:await store.get(key)})));
  const dossier={version:1,state:w,audit:await load(w.audit),artifacts:await load(w.artifacts),evidence:await load(w.evidence),pastRuns:await load(w.pastRuns)};
  await write(join(dir,"research.json"),JSON.stringify(dossier,null,2));
  await write(join(dir,"research.md"),markdown(w));await write(join(dir,"proof.tex"),latex(w));
  return dir;
}
