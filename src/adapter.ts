import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Worker, WorkerRequest, WorkerResponse } from "./inference.ts";
import type { Config } from "./schema.ts";

/** Uses the published Pi 0.85.1 registry API, including custom provider auth. */
export class PiWorker implements Worker{
  constructor(readonly ctx:Pick<ExtensionContext,"model"|"modelRegistry"|"scopedModels">,readonly config:Config){}
  async complete(request:WorkerRequest):Promise<WorkerResponse>{
    const [stage,role]=request.role.split("/");
    const selected=this.config.models[request.role]??this.config.models[role??""]??this.config.models[stage!]??this.config.models.default;
    const model=selected?this.ctx.modelRegistry.find(selected.provider,selected.id):this.ctx.model;
    if(!model)throw new Error("No research model available; select a Pi model or correct the role configuration");
    if(this.ctx.scopedModels.length&&!this.ctx.scopedModels.some(s=>s.model.id===model.id&&s.model.provider===model.provider))throw new Error("Research model is outside the session's scoped models");
    const response=await this.ctx.modelRegistry.complete(model,{
      systemPrompt:request.system,
      messages:[{role:"user",content:request.prompt,timestamp:Date.now()}],
      tools:[],
    },{signal:request.signal,maxTokens:request.maxOutputTokens,maxRetries:0,timeoutMs:this.config.timeoutMs});
    if(response.stopReason!=="stop")throw new Error(`Research worker ended with ${response.stopReason}: ${response.errorMessage??"No complete response"}`);
    if(response.content.some(c=>c.type==="toolCall"))throw new Error("Tool calls are not allowed in isolated research workers");
    return {text:response.content.filter(c=>c.type==="text").map(c=>c.text).join("\n"),model:`${response.provider}/${response.model}`,
      usage:{input:response.usage.input+response.usage.cacheRead+response.usage.cacheWrite,output:response.usage.output,cost:response.usage.cost.total}};
  }
}
