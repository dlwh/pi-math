import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseDataset, assess, visibleRows, unionWeights, weightedAccuracy } from "../src/discovery.ts";
import { AlgebraProver, verifyCertificate } from "../src/certificate.ts";
import { formatExpr } from "../src/expressions.ts";
import { leanSource } from "../src/lean.ts";
import { naiveEuler, eulerIdentity } from "./formulas.ts";

// This demonstration supplies its two candidate statements explicitly.
// Actual conjecture generation is exercised separately by ablate.ts.
const data=parseDataset(JSON.parse(await readFile(new URL("./euler-data.json",import.meta.url),"utf8")));
const visible=visibleRows(data,unionWeights(data));
const naive={statement:formatExpr(naiveEuler),visibleAccuracy:weightedAccuracy(naiveEuler,visible),evidence:assess(naiveEuler,data)};
assert.equal(naive.visibleAccuracy,1);
assert.deepEqual(naive.evidence.counterexamples,["torus","two-spheres"]);
const prover=new AlgebraProver();
const proof=await prover.prove(eulerIdentity,data.premises);
assert.equal(proof.outcome,"certified");
assert.ok(proof.certificate&&verifyCertificate(eulerIdentity,data.premises,proof.certificate));
assert.equal(assess(eulerIdentity,data).counterexamples.length,0);
const report={
  scope:"Exact educational computation; candidates and rank-nullity premises are supplied, not rediscovered.",
  naive,
  corrected:{statement:formatExpr(eulerIdentity),premises:data.premises.map(formatExpr),evidence:assess(eulerIdentity,data),proof},
  translation:"Euler characteristic equals the alternating sum of the displayed dimension expressions, conditional on the two rank-nullity premises. This does not construct chain complexes or independently prove topology facts.",
};
const out=resolve(process.argv[2]??"test-output/demo");await mkdir(out,{recursive:true});
await writeFile(join(out,"report.json"),JSON.stringify(report,null,2)+"\n");
await writeFile(join(out,"certificate.json"),JSON.stringify({features:data.features,expression:eulerIdentity,premises:data.premises,certificate:proof.certificate},null,2)+"\n");
await writeFile(join(out,"Claim.lean"),leanSource(eulerIdentity,data.premises));
console.log(JSON.stringify(report,null,2));
console.log(`Wrote reproducible evidence to ${out}. Claim.lean is generated source, not a recorded Lean execution.`);
