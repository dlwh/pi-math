import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { withFileMutationQueue, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readFile, realpath, stat, writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PiWorker } from "./adapter.ts";
import { Broker } from "./inference.ts";
import { StageRunner } from "./tree.ts";
import { ObjectStore, hash } from "./store.ts";
import { newResearch, ProofEngine, approve, amend, reexplore, addKnowledge, humanDecision } from "./proof.ts";
import { ConfigSchema, KnowledgeSchema } from "./schema.ts";
import { DiscoveryEngine, newDiscovery, parseDataset, assess, checkedFeedback } from "./discovery.ts";
import { parseExpr, formatExpr, canonical } from "./expressions.ts";
import { AlgebraProver } from "./certificate.ts";
import { LeanProver } from "./lean.ts";
import { ModelPolicy, HeuristicPolicy } from "./policies.ts";
import { emptyWorkbench, parseWorkbench, restoreWorkbench, SettingsSchema, WORKBENCH_TYPE, type Workbench } from "./workbench.ts";
import { summary, exportWorkbench } from "./export.ts";

const HELP=`/math start <question> — start a proof project
/math status — inspect current work and objections
/math step | run — advance once, or until a human gate/budget
/math approve [reason] — approve the displayed route or plan
/math accept <reason> — record human acceptance after global review
/math reexplore <reason> | amend <new target> | retry <reason>
/math dataset <JSON path> — load a discovery environment
/math discover [run] — one discovery cycle, or a bounded episode
/math use-conjecture — start a proof project from the last conjecture
/math premise <reason> — promote the last machine-checked conjecture to a premise
/math config [JSON path] — inspect or load settings
/math profile compact | paper — select aggregation size
/math export — export Markdown, LaTeX and complete JSON audit
/math cancel — cancel current research work`;

export async function readProjectJson(cwd:string,path:string):Promise<unknown>{
  const cleaned=path.trim().replace(/^@/,"").replace(/^"(.*)"$/,"$1");
  if(!cleaned)throw new Error("Supply a JSON file path");
  const base=await realpath(cwd),file=await realpath(resolve(cwd,cleaned)),rel=relative(base,file);
  if(rel.startsWith("..")||isAbsolute(rel))throw new Error("Input JSON must be inside the current project");
  if((await stat(file)).size>2_000_000)throw new Error("Input JSON exceeds 2 MB");
  return JSON.parse(await readFile(file,"utf8"));
}

export default function mathExtension(pi:ExtensionAPI):void{
  let w:Workbench=emptyWorkbench(),store:ObjectStore|null=null,loaded=false,epoch=0;
  let controller:AbortController|null=null,running:Promise<unknown>|null=null;
  let saveTail:Promise<void>=Promise.resolve(),lastCheckpoint:string|null=null,restoreFailure:string|null=null;
  const show=(text:string)=>pi.sendMessage({customType:"pi-math",content:text,display:true});
  function status(ctx:ExtensionContext){ctx.ui.setStatus("pi-math",`Math: ${w.proof?.phase??w.discovery?.status??"idle"}${running?" · working":""}`);}
  async function load(ctx:ExtensionContext){
    if(loaded&&store?.cwd===ctx.cwd){if(restoreFailure)throw new Error(restoreFailure);return;}
    store=new ObjectStore(ctx.cwd);loaded=true;restoreFailure=null;
    try{w=await restoreWorkbench(store,ctx.sessionManager.getBranch());}catch(error){restoreFailure=`Cannot restore research checkpoint: ${String(error)}`;throw new Error(restoreFailure);}
    status(ctx);
  }
  async function save(ctx:ExtensionContext,expectedEpoch=epoch):Promise<void>{
    const snapshot=structuredClone(w),destination=store;
    const pending=saveTail.then(async()=>{
      if(expectedEpoch!==epoch||!destination)throw new Error("Research session changed; refusing a stale write");
      parseWorkbench(snapshot);const key=await destination.put(snapshot);
      if(expectedEpoch!==epoch)throw new Error("Research session changed during checkpoint");
      pi.appendEntry(WORKBENCH_TYPE,{version:1,hash:key});lastCheckpoint=join(destination.root,"objects",`${key}.json`);status(ctx);
    });
    saveTail=pending.catch(()=>{});await pending;
  }
  async function exclusive<T>(ctx:ExtensionContext,work:(signal:AbortSignal)=>Promise<T>,signal?:AbortSignal):Promise<T>{
    if(running)throw new Error("Research is already running; use /math cancel first");
    if(!ctx.isProjectTrusted())throw new Error("Trust this project in Pi before starting research work");
    controller=new AbortController();
    const combined=signal?AbortSignal.any([signal,controller.signal]):controller.signal;
    // Install the busy marker before any worker or disk await.
    const job=Promise.resolve().then(async()=>{await load(ctx);if(combined.aborted)throw new Error("Research cancelled");return work(combined);});running=job;status(ctx);
    try{return await job;}finally{running=null;controller=null;await saveTail;status(ctx);}
  }
  async function stop(){controller?.abort();if(running)await running.catch(()=>{});await saveTail;}
  function result(text=summary(w)){return {content:[{type:"text" as const,text:text.length>12_000?text.slice(0,12_000)+`\n[Truncated. Full state: ${lastCheckpoint??"use /math export"}]`:text}],details:{checkpoint:lastCheckpoint}};}
  function broker(ctx:ExtensionContext,signal:AbortSignal){
    const cfg=w.proof?.config??w.settings.inference;
    return new Broker(new PiWorker(ctx,cfg),cfg,async record=>{w.audit.push(await store!.put(record));await save(ctx);},signal);
  }
  async function replaceProof(ctx:ExtensionContext,problem:string,assumptions:string[]=[]){
    if(w.proof)w.pastRuns.push(await store!.put(w.proof));
    w.proof=newResearch(problem,assumptions,w.settings.inference);await save(ctx);
  }
  async function proofWork(ctx:ExtensionContext,signal:AbortSignal,all:boolean){
    if(!w.proof)throw new Error("Start a proof project first");
    const calls=broker(ctx,signal),runner=new StageRunner(calls,calls.config,async artifact=>{w.artifacts.push(await store!.put(artifact));await save(ctx);});
    const engine=new ProofEngine(w.proof,runner,()=>save(ctx));
    try{if(all)await engine.run();else await engine.step();}
    finally{ctx.ui.notify(`Research used ${calls.usage.calls} model calls; reported cost $${calls.usage.reportedCost.toFixed(4)}`,"info");}
  }
  function prover(){return w.settings.lean?new LeanProver(resolve(store!.cwd,w.settings.lean.project),w.settings.lean.timeoutMs):new AlgebraProver();}
  async function discover(ctx:ExtensionContext,signal:AbortSignal,all:boolean){
    if(!w.discovery)throw new Error("Load a discovery dataset first");
    const calls=broker(ctx,signal),policy=w.settings.discoveryPolicy==="symbolic"?new HeuristicPolicy():new ModelPolicy(calls);
    const engine=new DiscoveryEngine(w.discovery,policy,prover(),signal);
    do{await engine.step();await save(ctx);}while(all&&w.discovery.status==="active");
  }
  async function importDataset(ctx:ExtensionContext,path:string){
    if(w.discovery)w.pastRuns.push(await store!.put(w.discovery));
    w.discovery=newDiscovery(parseDataset(await readProjectJson(ctx.cwd,path)),w.settings.discoveryRounds);await save(ctx);
  }
  async function check(ctx:ExtensionContext,signal:AbortSignal,expression:string){
    if(!w.discovery)throw new Error("Load a dataset to define the features and premises");
    const d=w.discovery.dataset,expr=parseExpr(JSON.parse(expression),d.features),empirical=assess(expr,d),proof=await prover().prove(expr,d.premises,signal);
    checkedFeedback(expr,d.premises,proof);
    if(proof.rho===1&&empirical.counterexamples.length)throw new Error("Certificate contradicts exact examples; stop and inspect the environment");
    const evidence={expression:expr,premises:d.premises,empirical,proof};const key=await store!.put(evidence);w.evidence.push(key);await save(ctx);
    return result(JSON.stringify({...evidence,evidenceFile:join(store!.root,"objects",key+".json")},null,2));
  }
  pi.registerTool({name:"math_research",label:"Math research",description:"Maintain a bounded mathematical proof workflow. Returns status and checkpoint path; output above 12,000 characters is truncated. Approval is human-only via /math.",promptSnippet:"Explore, plan, construct and review a mathematical argument",
    parameters:Type.Object({action:StringEnum(["start","status","step","run"]),problem:Type.Optional(Type.String({maxLength:60000})),assumptions:Type.Optional(Type.Array(Type.String({maxLength:8000}),{maxItems:100}))}),
    async execute(_id,args,signal,_update,ctx){
      if(args.action==="status"){await load(ctx);return result();}
      return exclusive(ctx,async combined=>{
        if(args.action==="start"){if(w.proof)throw new Error("A proof project already exists; use /math start to retain it and start another");if(!args.problem)throw new Error("A problem is required");await replaceProof(ctx,args.problem,args.assumptions??[]);}
        else await proofWork(ctx,combined,args.action==="run");return result();
      },signal);
    }});
  pi.registerTool({name:"math_discover",label:"Math discovery",description:"Discover conjectures through weighted data, feature spotters, scaffolding, skepticism and independent proof feedback. JSON datasets must be inside the project. Output limit: 12,000 characters.",promptSnippet:"Explore conjectures and concepts from an explicit mathematical dataset",
    parameters:Type.Object({action:StringEnum(["import","status","step","run"]),path:Type.Optional(Type.String())}),
    async execute(_id,args,signal,_update,ctx){
      if(args.action==="status"){await load(ctx);return result();}
      return exclusive(ctx,async combined=>{if(args.action==="import"){if(w.discovery)throw new Error("Use /math dataset to replace an existing environment");await importDataset(ctx,args.path??"");}else await discover(ctx,combined,args.action==="run");return result();},signal);
    }});
  pi.registerTool({name:"math_check",label:"Math check",description:"Exactly evaluate an integer AST and run the configured certificate prover against the current dataset's premises. expression is a JSON AST, never executable code. Unknown is not false. Output limit: 12,000 characters.",promptSnippet:"Execute a mathematical check with evidence bound to the exact statement",
    parameters:Type.Object({expression:Type.String({maxLength:60000})}),
    async execute(_id,args,signal,_update,ctx){return exclusive(ctx,combined=>check(ctx,combined,args.expression),signal);}});
  pi.registerTool({name:"math_note",label:"Math knowledge",description:"Preserve a sourced lemma, failed approach, reference or observation with hypotheses and caveats. Entries are recorded as unverified; this tool cannot certify a claim.",promptSnippet:"Record reusable research knowledge with provenance",
    parameters:Type.Object({kind:StringEnum(["lemma","failure","reference","observation"]),statement:Type.String({maxLength:60000}),hypotheses:Type.Array(Type.String()),sources:Type.Array(Type.String(),{minItems:1}),caveats:Type.Array(Type.String())}),
    async execute(_id,args,signal,_update,ctx){return exclusive(ctx,async()=>{if(!w.proof)throw new Error("Start a proof project first");addKnowledge(w.proof,KnowledgeSchema.parse({...args,id:`k-${randomUUID()}`,status:"unverified"}));await save(ctx);return result();},signal);}});
  pi.registerCommand("math",{description:"Human-guided mathematical research; /math help for commands",handler:async(args,ctx)=>{
    const [command="help",...pieces]=args.trim().split(/\s+/),rest=pieces.join(" ");
    try{
      if(command==="help"||!command){show(HELP);return;}
      if(command==="cancel"){await stop();show("Research cancelled; completed checkpoints are retained.");return;}
      if(command==="status"){await load(ctx);show(summary(w));return;}
      await exclusive(ctx,async signal=>{
        switch(command){
          case "start":if(!rest)throw new Error("Use /math start <question>");await replaceProof(ctx,rest);break;
          case "step":case "run":await proofWork(ctx,signal,command==="run");break;
          case "approve":if(!w.proof||!["awaiting-route","awaiting-plan"].includes(w.proof.phase))throw new Error("No route or plan awaits approval; final acceptance uses /math accept");approve(w.proof,rest||"Approved by human command");await save(ctx);break;
          case "accept":if(w.proof?.phase!=="awaiting-acceptance")throw new Error("A complete global review is required before acceptance");approve(w.proof,rest);await save(ctx);break;
          case "amend":if(!w.proof)throw new Error("No proof project");amend(w.proof,rest,"Human changed the target");await save(ctx);break;
          case "reexplore":if(!w.proof)throw new Error("No proof project");reexplore(w.proof,rest);await save(ctx);break;
          case "retry":{
            const p=w.proof;if(!p||p.phase!=="blocked"||!p.plan)throw new Error("Retry applies to blocked local proof work; adjust round limits or re-explore otherwise");
            humanDecision(p,"retry",rest);for(const s of Object.values(p.sections))if(s.status!=="accepted")s.attempts=0;p.phase="solve";p.failure=null;await save(ctx);break;
          }
          case "dataset":await importDataset(ctx,rest);break;
          case "discover":await discover(ctx,signal,rest==="run");break;
          case "use-conjecture":{const d=w.discovery,last=d?.rounds.at(-1);if(!d||!last)throw new Error("No discovery conjecture");await replaceProof(ctx,`For integer features ${d.dataset.features.join(", ")}, establish ${formatExpr(last.conjecture)}`,d.dataset.premises.map(formatExpr));break;}
          case "premise":{
            const d=w.discovery,last=d?.rounds.at(-1);if(!d||!last||last.proof.rho!==1)throw new Error("Only a machine-checked last conjecture can be promoted");if(!rest)throw new Error("Explain why this should become background knowledge");
            checkedFeedback(last.conjecture,last.premises,last.proof);
            if(d.dataset.premises.some(p=>canonical(p)===canonical(last.conjecture)))throw new Error("Already a premise");
            d.dataset.premises.push(last.conjecture);parseDataset(d.dataset);d.status="active";
            w.humanEvents.push({action:"promote-premise",reason:rest,at:new Date().toISOString(),artifactHash:hash(last)});await save(ctx);break;
          }
          case "config":if(!rest){show(JSON.stringify(w.settings,null,2));return;}w.settings=SettingsSchema.parse(await readProjectJson(ctx.cwd,rest));if(w.proof)w.proof.config=structuredClone(w.settings.inference);await save(ctx);break;
          case "profile":if(!["compact","paper"].includes(rest))throw new Error("Profiles: compact or paper");w.settings.inference=ConfigSchema.parse({...w.settings.inference,widths:rest==="paper"?[16,8,5,1]:[4,2,1],sampleSize:rest==="paper"?5:3});if(w.proof)w.proof.config=structuredClone(w.settings.inference);await save(ctx);break;
          case "export":{const dir=await exportWorkbench(store!,w,async(path,text)=>withFileMutationQueue(path,()=>writeFile(path,text,{flag:"wx",mode:0o600})));show(`Research dossier exported to ${dir}`);return;}
          default:throw new Error(`Unknown command ${command}. Use /math help.`);
        }
        show(summary(w));
      });
    }catch(error){ctx.ui.notify(error instanceof Error?error.message:String(error),"error");}
  }});
  pi.on("session_start",async(_event,ctx)=>{loaded=false;await load(ctx);});
  pi.on("session_before_switch",async()=>{await stop();epoch++;});
  pi.on("session_before_fork",async()=>{await stop();epoch++;});
  pi.on("session_before_tree",async()=>{await stop();epoch++;});
  pi.on("session_tree",async(_event,ctx)=>{loaded=false;await load(ctx);});
  pi.on("session_shutdown",async()=>{await stop();epoch++;});
  pi.on("before_agent_start",async(_event,ctx)=>{
    await load(ctx);if(!w.proof&&!w.discovery)return;
    return {message:{customType:"pi-math-context",display:false,content:`Current branch research state:\n${summary(w).slice(0,9000)}\nUse math tools for research transitions. Route/plan approvals, target changes, premise promotion and final human acceptance require explicit /math commands. Distinguish model review, empirical checks, exact certificates and human judgments. Full checkpoint: ${lastCheckpoint??"available through /math export"}`}};
  });
}
