import type { Model } from "@earendil-works/pi-ai";
import { SettingsSchema, type Settings } from "./workbench.ts";
import type { Generation } from "./schema.ts";

export const PRESET_REVISION = "2026-09-19";
export interface Preset {
    id: string;
    title: string;
    where: "hosted" | "local";
    description: string;
    model: { provider: string; id: string };
    settings: Settings;
    providers: Record<string, Record<string, unknown>>;
    sources: string[];
    validation: "source-reviewed; mock-transport-tested; live-validation-pending";
    memory: string;
    license: string;
    testedPi: "0.85.1";
    runtimeRevision: string;
}
type Compat = NonNullable<Model<"openai-completions">["compat"]>;
const standard: Compat = { supportsStore: false, supportsDeveloperRole: false, supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens" };
const qwenTemplate: Compat = { ...standard, thinkingFormat: "chat-template", chatTemplateKwargs: {
    enable_thinking: { $var: "thinking.enabled" }, reasoning_effort: { $var: "thinking.effort", omitWhenOff: true }, preserve_thinking: true,
}, thinkingTokenBudgetField: "thinking_budget_tokens" };
const qwenLevels = { off: "none", minimal: null, low: "low", medium: "medium", high: null, xhigh: "xhigh", max: null };
function local(id: string, title: string, provider: string, modelId: string, port: number, compat: Compat, generation: Generation, source: string, memory: string, description: string, levels?: Model<"openai-completions">["thinkingLevelMap"]): Preset {
    return {
        id, title, where: "local", description, testedPi: "0.85.1", license: id === "local-ds4" ? "MIT" : "Apache-2.0",
        runtimeRevision: provider === "math-bonsai" ? "PrismML llama.cpp 9a9394a895b96003ca842a6041cb28ac49a108f7" : provider === "math-ds4" ? "ds4 8db1d1d155cb0400a86a86b9c62d0defb3a6148b" : provider === "math-llama" ? "llama.cpp 5b59b83f4e2101ea173d4f853a0522d9971f48c6" : "Record installed runtime version; live validation pending", model: { provider, id: modelId }, sources: [source], memory,
        validation: "source-reviewed; mock-transport-tested; live-validation-pending",
        providers: { [provider]: { baseUrl: `http://127.0.0.1:${port}/v1`, api: "openai-completions", apiKey: "local-placeholder", models: [{
            id: modelId, name: title, reasoning: true, input: ["text"], contextWindow: 32768, maxTokens: 8192,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, compat,
            ...(levels ? { thinkingLevelMap: levels } : {}),
        }] } },
        settings: SettingsSchema.parse({ inference: { widths: [1], sampleSize: 1, reviewers: 1, concurrency: 1, maxCalls: 32,
            maxOutputTokens: 4096, maxReservedOutputTokens: 131072, timeoutMs: 600000, localOnly: true,
            models: { default: { provider, id: modelId } }, generation: { default: { reasoning: "medium", structuredOutput: "prompt", contextWindow: 32768, ...generation } },
        } }),
    };
}
function hosted(id: string, title: string, modelId: string, generation: Generation, price: [number, number], source: string, levels?: Model<"openai-completions">["thinkingLevelMap"]): Preset {
    return {
        id, title, where: "hosted", testedPi: "0.85.1", runtimeRevision: "OpenRouter service; record upstream route at evaluation time", license: id === "hosted-kimi" ? "Kimi K3 License" : id === "hosted-qwen" ? "Qwen3.8-Max License" : "MIT", description: "Uses an OpenRouter API balance. Begin with the small workflow; raise budgets deliberately.", model: { provider: "openrouter", id: modelId },
        sources: [source], memory: "No model-sized local memory required", validation: "source-reviewed; mock-transport-tested; live-validation-pending",
        providers: { openrouter: { api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1", models: [{
            id: modelId, name: title, reasoning: true, input: ["text"], contextWindow: 1048576, maxTokens: 131072,
            cost: { input: price[0], output: price[1], cacheRead: price[0], cacheWrite: price[0] },
            compat: { ...standard, thinkingFormat: "openrouter", openRouterRouting: { allow_fallbacks: false, require_parameters: true } },
            ...(levels ? { thinkingLevelMap: levels } : {}),
        }] } },
        settings: SettingsSchema.parse({ inference: { widths: [1], sampleSize: 1, reviewers: 1, concurrency: 2, maxCalls: 32,
            maxOutputTokens: 16384, maxReservedOutputTokens: 524288, timeoutMs: 600000,
            models: { default: { provider: "openrouter", id: modelId } }, generation: { default: { reasoning: "high", structuredOutput: "prompt", contextWindow: 131072, ...generation } },
        } }),
    };
}
export const PRESETS: readonly Preset[] = [
    hosted("hosted-value", "DeepSeek V4.1 Flash", "deepseek/deepseek-v4.1-flash", { reasoning: "high", temperature: 1, topP: 1 }, [0.15, 0.60], "https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash"),
    hosted("hosted-kimi", "Kimi K3", "moonshotai/kimi-k3", { reasoning: "high" }, [1.70, 8.50], "https://huggingface.co/moonshotai/Kimi-K3", { off: null, minimal: null, low: "low", medium: null, high: "high", xhigh: null, max: "max" }),
    hosted("hosted-qwen", "Qwen3.8 released weights", "qwen/qwen3.8-2.4t-a95b", { reasoning: "medium", temperature: 1, topP: 0.95 }, [2, 6], "https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B", { ...qwenLevels, off: null }),
    local("local-ollama", "Qwen3.8 27B via Ollama", "math-ollama", "pi-math-qwen38", 11434, { ...standard, thinkingFormat: "openai" }, { reasoning: "medium" }, "https://ollama.com/library/qwen3.8", "About 18 GB download; plan for 24–32+ GB available GPU/unified memory, then measure", "Easy local entry after installing Ollama and creating the context-sized model.", { off: "none", low: "low", medium: "medium", high: "high", xhigh: null, max: "max" }),
    local("local-small", "gpt-oss 20B via Ollama", "math-ollama", "pi-math-gpt-oss", 11434, { ...standard, thinkingFormat: "openai" }, { reasoning: "low" }, "https://huggingface.co/openai/gpt-oss-20b", "Model card describes 16 GB deployment; context and other apps still need headroom", "Lower-memory baseline; do not expect the hosted models' proof quality.", { off: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null }),
    local("local-unsloth", "Unsloth Qwen3.8 27B GGUF", "math-llama", "pi-math-qwen38", 8080, qwenTemplate,
        { reasoning: "medium", temperature: 1, topP: 0.95, topK: 20, minP: 0 }, "https://huggingface.co/unsloth/Qwen3.8-27B-GGUF", "UD-Q4_K_XL weights about 17.6 GB plus cache/buffers; plan 24–32+ GB", "Advanced llama.cpp route. Use the exact quantization and --alias in the local guide.", qwenLevels),
    local("local-lmstudio", "Unsloth Qwen3.8 via LM Studio", "math-lmstudio", "pi-math-qwen38", 1234, qwenTemplate,
        { reasoning: "medium", temperature: 1, topP: 0.95, topK: 20, minP: 0 }, "https://lmstudio.ai/docs/developer/openai-compat", "Same weights/cache requirements as the selected GGUF", "GUI alternative; set the model identifier and context exactly as documented.", qwenLevels),
    local("local-bonsai", "Ternary Bonsai 27B", "math-bonsai", "pi-math-bonsai-ternary", 8080, { ...standard, thinkingFormat: "qwen-chat-template" },
        { reasoning: "high", temperature: 0.7, topP: 0.95, topK: 20 }, "https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf", "About 7.2 GB deployed language weights, plus working memory; 16 GB machine is a candidate to measure", "Experimental low-memory route. Requires the matching PrismML runtime; proof quality is unmeasured."),
    local("local-bonsai-1bit", "1-bit Bonsai 27B", "math-bonsai", "pi-math-bonsai-1bit", 8080, { ...standard, thinkingFormat: "qwen-chat-template" },
        { reasoning: "high", temperature: 0.7, topP: 0.95, topK: 20 }, "https://huggingface.co/prism-ml/Bonsai-27B-gguf", "About 3.9 GB weights plus working memory; memory estimate is not a fit guarantee", "Experimental footprint-first route using PrismML's binary kernels."),
    local("local-ds4", "DwarfStar DeepSeek V4 Flash", "math-ds4", "deepseek-v4-flash", 8000, { ...standard, thinkingFormat: "deepseek", supportsStrictMode: false, requiresReasoningContentOnAssistantMessages: true },
        { reasoning: "high", temperature: 1, topP: 1 }, "https://github.com/antirez/ds4", "V4 Flash Q2: follow upstream's 96/128 GB starting guidance; SSD streaming is a separate route", "Advanced engine with its own model files. API aliases do not identify the loaded weights.", { off: "none", low: "low", medium: "medium", high: "high", xhigh: "xhigh", max: "max" }),
    local("local-vllm", "Qwen3.8 27B via vLLM", "math-vllm", "pi-math-qwen38", 8000,
        { ...qwenTemplate, thinkingTokenBudgetField: "thinking_token_budget" }, { reasoning: "medium", temperature: 1, topP: 0.95, topK: 20, minP: 0 },
        "https://unsloth.ai/docs/models/qwen3.8", "Depends on precision/GPU; NVFP4 requires supported Blackwell hardware", "Advanced server route; use a supported model-specific recipe and reasoning parser.", qwenLevels),
];
export function getPreset(id: string): Preset {
    const found = PRESETS.find(p => p.id === id);
    if (!found) throw new Error(`Unknown preset ${id}. Use /math setup to list choices.`);
    return structuredClone(found);
}
export function presetMenu(): string {
    return "Choose where the maths assistant runs. Hosted uses a paid API; local uses your computer.\n\n" + PRESETS.map(p => `${p.id} — ${p.title}\n  ${p.description}\n  ${p.memory}`).join("\n\n")
        + "\n\nPreview: /math setup <name>\nApply: /math setup <name> --apply\nAll recipes await live hardware/provider validation. See docs/ONBOARDING.md.";
}
