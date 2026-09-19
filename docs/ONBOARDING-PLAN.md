# Onboarding implementation plan and adversarial review

Date: 2026-09-19. The expanded plan was posted in [issue #9](https://github.com/hammer/pi-math/issues/9) **before implementation**, following the user's request to cover Bonsai, Unsloth, ds4, and mathematically literate beginners. That issue contains the full dated research and original six chunks.

## Implementation chunks

| Chunk | Delivered software / documentation | Verification |
| --- | --- | --- |
| 1. Worker controls | Default/per-role reasoning, sampling, context and output settings; native numeric DeepSeek; schema hooks; combined reservations; tool/model/cap guards; local transport policy | Actual Pi HTTP client against loopback mock servers, including adversarial failures |
| 2. Presets and setup | Eleven dated hosted/local presets; generated provider/settings examples; preview/apply merge; backups; offline doctor; explicit two-call probe | Pi registry loading, every preset's emitted payload, temporary-directory migration/conflict tests, real extension command registration |
| 3. Accessible guides | Beginner model/Pi explanation, hosted/Ollama setup, small theorem and human gates, recovery; advanced Unsloth/PrismML/ds4/vLLM recipes; settings/research reference | Examples checked against code and schemas; runtime flags and files reviewed against primary sources |
| 4. Evaluation and review | Six-task opt-in runner, separate rubrics, exact counterexample validation, partial-failure audit, provenance label, matched caps and optional role settings | Offline fixtures and CLI tests; full original test suite, demo, certificate verifier, ablations, packaging, CI |

The original six steps map to these four commits: reasoning and structured output share the transport chunk; catalog and setup share the onboarding chunk; docs and evaluation remain separately reviewable. Actual paid/local quality evaluation is a release evidence gate, not something inferred from these software tests.

## Research decisions and refinements

- Provide Ollama as the simple local path and OpenRouter as the simple hosted path; show the model choice before engine terminology.
- Use Unsloth Qwen3.8 27B UD-Q4_K_XL as the initial explicit-file recipe. Treat NVFP4 as a separate hardware-dependent format. Pin the reviewed llama.cpp source for the recipe.
- Use PrismML's fork for the selected Bonsai ternary/binary files. Distinguish ideal 5.9 GB ternary packing from roughly 7.2 GB deployed weights and additional runtime memory.
- Pin ds4 to the reviewed source revision and target V4 Flash Q2 first. Describe V4.1 separately; record the loaded file because its API ID is an alias.
- Refine the original 8K–16K smoke-context suggestion to **32K declared context with one worker** for the supplied recipes, leaving room for schemas and accumulated review artifacts. This is a source-derived starting point, not a memory fit measurement. Document how to lower server and client context together on constrained hardware.
- Keep native JSON constraints opt-in. Server/parser/schema support cannot be established from a generic OpenAI-compatible endpoint label.
- Keep the initial tree `[1]` separate from the original compact and paper profiles; do not attach a paper's quality claim to reduced onboarding compute.

## Adversarial review

| Challenge | Decision and boundary |
| --- | --- |
| A “local” session has a cloud critic override | Resolve and check every worker role; local-only mode rejects non-loopback endpoints and redirects. Show the parent separately. A trusted local server could still forward requests internally. |
| Hidden payload overrides increase cost or add tools | Allow only finite numeric sampling fields and inspect the final serialized model, cap, completion count, and tool list. No hidden retry or fallback. |
| Reasoning consumes the entire answer budget | Reserve the actual role cap; validate explicit thinking/final-answer split; expose truncation. Effort alone cannot promise final-answer space. |
| Setup overwrites a user's custom providers or secrets | Preview first, preserve unrelated fields, reject conflicts/overrides, back up privately, use a lock and atomic rename, reload without catalog networking. Never print auth values. External editors should not write simultaneously. |
| A GGUF extension implies engine support | Pin known engine/model combinations and label live validation pending. Specialized Bonsai/ds4 files require their matching runtime. |
| A model alias or low active parameter count implies actual weights/memory | Require filename/checksum/runtime/hardware provenance for evaluation; distinguish weight file size, residency, cache, and SSD offload. |
| A JSON or critic success is presented as a proof | Retain strict parsing but leave human judgments blank; use an independent exact witness check and existing certificate verifier; preserve route/plan/acceptance gates. |
| A beginner copies approvals without reading | Explain each gate and conditional approval reason, show a checkable induction step, and provide disagreement/recovery paths. |
| A six-task trial becomes a leaderboard | Label it a sanity suite; distinguish matched caps from equal compute; require repeated human-reviewed evidence for quality claims. |
| A paid request happens while “checking setup” | Offline doctor and CLI dry-run make no inference call. `--probe` and `--live` explicitly opt in and print finite request/token limits. |

## Pending live evidence

Before promoting any recipe from source-reviewed/mock-tested to live-tested, run it on the exact provider or quantized model, record hardware/versions/context/usage/failures, complete and export the beginner proof, and assess its mathematics. Before claiming one model is best, run broader held-out tasks with human adjudication and documented budgets. This environment has not supplied that evidence; see the [validation record](ONBOARDING-VALIDATION.md). Issue #9 remains open for those gates.
