import { readFile } from "node:fs/promises";
import { z } from "zod";
import { parseExpr } from "../src/expressions.ts";
import { verifyCertificate, type Certificate } from "../src/certificate.ts";

const path=process.argv[2];if(!path)throw new Error("Usage: npm run verify:certificate -- path/to/certificate.json");
const record=z.object({features:z.array(z.string()).max(24),expression:z.unknown(),premises:z.array(z.unknown()).max(32),certificate:z.unknown()}).strict().parse(JSON.parse(await readFile(path,"utf8")));
const expr=parseExpr(record.expression,record.features),premises=record.premises.map(p=>parseExpr(p,record.features));
if(!verifyCertificate(expr,premises,record.certificate as Certificate))throw new Error("Certificate rejected");
console.log("Certificate verified against the exact statement and premises. Inspect their mathematical interpretation separately.");
