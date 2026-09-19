# Model choices and settings

Research date: **2026-09-19**. Start with [onboarding](ONBOARDING.md); this page explains the choices and configuration. The [preset manifest](../examples/providers/manifest.json) records identities, licenses, Pi version, runtime revision where pinned, sources, and validation status. All model/engine recipes still require live validation; mocked transport tests establish request behavior only.

## Which models are worth evaluating?

| Purpose | Candidate / preset | Why it is a candidate |
| --- | --- | --- |
| Economical hosted starting point | DeepSeek V4.1 Flash / `hosted-value` | MIT weights and a low listed per-token route price make repeated generator/critic calls practical |
| Hosted quality comparison | Qwen3.8-2.4T-A95B / `hosted-qwen` | Relevant current reasoning family; use the released-weight endpoint, not an assumed equivalent Max service |
| Different family for generation or criticism | Kimi K3 / `hosted-kimi` | A strong reasoning candidate with explicit mandatory-thinking controls |
| Practical local starting point | Qwen3.8 27B / `local-ollama`, `local-unsloth`, `local-lmstudio` | Apache-2.0 weights and several local distributions |
| Lower-memory baseline | gpt-oss 20B / `local-small` | Documented 16 GB deployment and supported local packaging |
| Experimental low-bit alternative | PrismML Bonsai / `local-bonsai`, `local-bonsai-1bit` | Much smaller deployed weights; compare proof errors at the exact precision |
| Large-memory specialized engine | DeepSeek V4 Flash in ds4 / `local-ds4` | Upstream documents a Pi integration; use engine-specific weights |

Primary model sources: [DeepSeek V4.1 Flash](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash), [Qwen large weights](https://huggingface.co/Qwen/Qwen3.8-2.4T-A95B), [Kimi K3](https://huggingface.co/moonshotai/Kimi-K3), [Qwen 27B](https://huggingface.co/Qwen/Qwen3.8-27B), [gpt-oss 20B](https://huggingface.co/openai/gpt-oss-20b). “Open weights” covers different licenses: the large Qwen and Kimi releases use their own license terms; it is not synonymous with Apache-2.0. Bonsai/Unsloth/runtime details are in the [local guide](LOCAL-MODELS.md).

The initial research found MathArena expected-performance aggregates of 56.1% for Qwen3.8-Max, 50.4% for Kimi K3, and 43.2% for DeepSeek V4.1 Flash. This includes estimated missing results and differing settings. It is not a controlled pi-math comparison. Qwen's released checkpoint, the benchmark's Max service, and the newer Max-0902 service are distinct identities. The preset deliberately selects `qwen/qwen3.8-2.4t-a95b`; no Max score is attributed to it. [Evaluation table and methodology](https://matharena.ai/models), [current hosted Max listing](https://openrouter.ai/qwen/qwen3.8-max-0902).

For further experiments, [DeepSeek-Math-V2](https://github.com/deepseek-ai/DeepSeek-Math-V2) is relevant because of proof-oriented generator/verifier training. [OpenMath-Nemotron-32B](https://huggingface.co/nvidia/OpenMath-Nemotron-32B) provides specialist modes. Their published settings and scaled/tool-assisted evaluations do not establish compatibility with pi-math's tool-free JSON workers. They are not beginner presets.

## Hosted routing and cost

The supplied hosted presets use OpenRouter and Pi's existing authentication. `/login openrouter` uses OpenRouter credit; alternatively set `OPENROUTER_API_KEY` using your normal credential management. Setup never writes that key into a project or export. For custom provider files Pi 0.85.1 uses an explicit string such as `"$OPENROUTER_API_KEY"` to reference an environment variable; an unprefixed uppercase string is a literal. [Pi provider authentication](https://pi.dev/docs/latest/providers), [custom model configuration](https://pi.dev/docs/latest/models).

Dated listing prices per million input/output tokens are $0.15/$0.60 for a DeepSeek V4.1 Flash route, $1.70/$8.50 for Kimi K3, and $2/$6 for the Qwen weight-backed endpoint. These initialize display estimates, not billing guarantees. Confirm the [DeepSeek](https://openrouter.ai/deepseek/deepseek-v4.1-flash), [Kimi](https://openrouter.ai/moonshotai/kimi-k3), and [Qwen](https://openrouter.ai/qwen/qwen3.8-2.4t-a95b) route listings before substantial runs. Multiple inputs and reasoning increase cost; cancellation may still be billed.

Presets set `allow_fallbacks: false` and `require_parameters: true`. This prevents retry routing and requires parameter support; it does **not** pin a specific upstream or quantization. For a reproducible experiment, use a supported explicit upstream allowlist in Pi's `compat.openRouterRouting`, and record it with the result. Do not treat an aggregate model alias as immutable weights. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

The direct Kimi endpoint is `https://api.moonshot.ai/v1`, model `kimi-k3`. Its API always reasons, offers low/high/max, and fixes sampling; omit temperature/top-p overrides on that route. Pi's native `moonshotai` provider can reuse its own login. A custom provider needs the correct endpoint, credential reference, and compatibility metadata. [Kimi API guide](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart).

Native DeepSeek V4.1 uses a numeric reasoning effort from 1 to 100, while a gateway uses its documented labels. Numeric settings here require an `openai-completions` model entry with `thinkingFormat: "deepseek"` and a V4.1 ID. The native number is serialized as a number. Do not send it to the OpenRouter preset. [DeepSeek card and usage](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash).

## Two configuration layers

**Pi's `models.json`** defines a provider URL, auth reference, API format, model ID, model limits, and server compatibility. **pi-math's settings JSON** chooses worker roles, generation settings, and workflow budgets. Changing a context number in either file does not reconfigure the running server. Use the matching server launch options too.

`/math setup <preset>` previews both layers' intended changes. `--apply` merges the provider entry and replaces **only this session's inference settings**, preserving discovery and Lean settings. Unrelated provider entries survive. Conflicts require manual review; applying does not execute credential commands, install a server, or download weights. `/math config <file>` instead replaces the entire settings object with validated values/defaults.

Old settings and checkpoints remain readable. If no model override is present, workers use the selected Pi model. Workers do not inherit the parent conversation's thinking setting, tools, or history.

## Generation settings

Start by copying the appropriate complete `examples/providers/<preset>.math.json` into a project-local settings file. Edit it, then use `/math config <file>`. This fragment illustrates the generation section, not a replacement for your full settings:

```json
{
  "inference": {
    "generation": {
      "default": { "reasoning": "medium", "structuredOutput": "prompt", "contextWindow": 32768 },
      "critic": { "maxOutputTokens": 6144 },
      "section/critic": { "reasoning": "low" }
    }
  }
}
```

Generation values merge **per field** in this order: default → stage → role suffix → full role. For example, `section/critic` retains context and JSON mode, gets the critic's 6,144-token cap, and uses low reasoning. Model entries resolve as whole entries in the reverse priority: full role → suffix → stage → default → selected Pi model. All selected workers must satisfy the session's scoped-model restrictions.

| Field | Meaning |
| --- | --- |
| `reasoning` | `auto` selects a supported level; `default` leaves provider defaults; `off` requests no reasoning where supported; explicit labels must be supported by model metadata; native DeepSeek V4.1 can use an integer 1–100 |
| `maxOutputTokens` | Per-call combined generation reservation; thinking can consume it before the final answer |
| `contextWindow` | Additional declared context bound, capped by the model's metadata |
| `thinkingBudget` | Optional explicit thinking-token limit, only with a declared compatible server field |
| `finalAnswerReserve` | Space to keep within the combined cap when using `thinkingBudget`; defaults to 1,024; a configuration check, not a semantic guarantee |
| `temperature`, `topP`, `topK`, `minP` | Optional model-specific sampling overrides; unsupported direct-Kimi overrides fail |
| `structuredOutput` | `prompt` (default): JSON schema in the prompt plus strict local validation; `json-schema`: additionally request OpenAI-completions native schema constraints |

The output ceiling is 524,288 but each model's declared maximum and the invocation reservation still apply. Local preset metadata initially caps output at 8,192; increasing beyond that requires reviewing the actual server/model limit and editing metadata too. The conservative input check counts UTF-8 bytes plus overhead as token units. It is deliberately pessimistic and is not a tokenizer or a guarantee about unknown server limits.

Explicit generation controls currently support Pi's OpenAI-compatible APIs. Other Pi APIs retain their provider defaults when `auto`/`default` is used; explicit incompatible settings fail. Optional token-budget fields differ by server: llama.cpp `thinking_budget_tokens`, vLLM `thinking_token_budget`, and some Qwen services `thinking_budget`. A potentially conflicting `thinking_budget` plus `reasoning_effort` is refused. The preset's compatibility metadata determines payload translation, not an arbitrary extra-body object.

Native JSON-schema mode is opt-in after testing your endpoint. The adapter requires the OpenAI-completions API, and the server may still reject a particular schema. No automatic retry strips the constraint; use prompt mode explicitly if the endpoint lacks support. Local Zod validation remains strict in both modes. Thinking text is excluded from the final JSON; truncation, tool calls, empty answers, malformed JSON, and provider errors are visible failures. JSON validity says nothing about mathematical truth.

Inherited `samplingParams` are restricted to finite numeric sampling fields. Final serialized requests are checked for the chosen model, exactly the reserved output cap, one completion, and no tools. Local-only requests must stay on the configured loopback origin; redirects are refused. The setting controls worker transport, not an arbitrary local server's internals or Pi's ordinary parent conversation.

## Breadth, effort, and evaluation are separate choices

Onboarding uses widths `[1]` with one reviewer; the old compact profile `[4,2,1]` still exists and uses 14 calls per stage. A model change does not justify a wider tree or a higher output budget automatically. Each `/math run` or `/math step` has its own reservations. Read [budget semantics](USAGE.md#configuration-and-budgets).

To compare families, first run the same [evaluation tasks](EVALUATION.md) at matched output caps and record actual tokens, latency, and any provider cost estimates. Then try a separate quality-oriented track with deliberately larger caps. A mixed-family critic may make different errors, but independence is a hypothesis to measure. Add a model override such as `"critic": {"provider":"openrouter","id":"moonshotai/kimi-k3"}` only after setting up that provider/model and its matching generation settings. Local-only mode rejects remote role overrides.
