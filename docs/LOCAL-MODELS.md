# Local models, quantization, and engines

Research snapshot: **2026-09-19**. Start with the [beginner guide](ONBOARDING.md) for Ollama. This page is for choosing files and running servers yourself. Recipes are source-reviewed; actual hardware/model validation remains pending. Read the [validation record](ONBOARDING-VALIDATION.md) before treating a configuration as tested.

## What should I try?

| Weights / precision | Approximate language-weight download | Engine / preset | Practical interpretation |
| --- | --- | --- | --- |
| Qwen3.8 27B, Ollama distribution | 18 GB | Ollama / `local-ollama` | Easiest local starting route; allow memory beyond the file |
| Unsloth Qwen3.8 27B, UD-Q4_K_XL | 17.6 GB | llama.cpp / `local-unsloth`; LM Studio / `local-lmstudio` | More control over the quantization; start with 24–32+ GB available memory as a planning estimate |
| Unsloth UD-Q3_K_XL / UD-Q5_K_XL / Q8_0 | 13.1 / 20.9 / 29 GB | Same compatible GGUF engine | Trade memory against changed model behavior; compare the actual files on your tasks |
| Ternary Bonsai 27B, PQ2_0 | About 7.2 GB deployed | PrismML fork / `local-bonsai` | Experimental footprint-first alternative derived from Qwen3.6-27B |
| Binary Bonsai 27B, Q1_0 | About 3.9 GB | PrismML fork / `local-bonsai-1bit` | Smaller again; proof reliability has not been measured here |
| gpt-oss 20B | See distribution | Ollama / `local-small` | Its author documents 16 GB deployment; correct Harmony formatting is essential |
| DeepSeek V4 Flash 0731, ds4 Q2 | About 81 GiB | DwarfStar / `local-ds4` | Start with upstream's 96/128 GB hardware guidance; very different from a laptop-sized model |
| Qwen3.8 27B NVFP4 | See exact checkpoint | vLLM / `local-vllm` | Blackwell-specific advanced route; not interchangeable with GGUF |

File sizes come from the [Unsloth file listing](https://huggingface.co/unsloth/Qwen3.8-27B-GGUF/tree/main), [Bonsai ternary card](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf), [binary card](https://huggingface.co/prism-ml/Bonsai-27B-gguf), and [ds4 model guide](https://github.com/antirez/ds4/blob/8db1d1d155cb0400a86a86b9c62d0defb3a6148b/docs/MODELS.md). GB and GiB are different units; the table retains the source's convention. These are not measured peak RAM numbers.

Quantization reduces precision in the weights. Unsloth's mixed-precision files and PrismML's specialized ternary/binary models use different techniques. A suffix such as “Q2” is not a universal quality score or a promise that any GGUF engine can load the file. General benchmark retention does not establish retained ability to detect a subtle false proof.

## Memory and context

Allow room for **weights + the model's working buffers + the conversation cache + other applications**. Longer context and simultaneous requests can increase memory use. CPU/RAM or SSD offload can make a model fit while making it too slow for a multi-call proof workflow. Active parameter count describes computation, not total weight residency.

All supplied local presets start with concurrency 1, declared context 32,768, and 4,096 output tokens per call. This is a starting configuration to measure. If you reduce context to 16,384, change all three locations: the server launch/Modelfile, the corresponding model's `contextWindow` in Pi's `models.json`, and `inference.generation.default.contextWindow` in your settings JSON. Load the full settings with `/math config <project-local file>`. Keep the output allowance lower than context; it must leave room for prompts and schemas. Reapplying a preset restores its initial settings.

The examples in `examples/providers` are **merge examples**, not files to copy over a populated global configuration. `/math setup` performs the cautious merge for the supplied defaults. Pi normally uses `~/.pi/agent/models.json`, or the directory named by `PI_CODING_AGENT_DIR`. Use `/math doctor` after edits. It checks declared values; it cannot inspect physical RAM or verify a server's real context.

## Unsloth GGUF with llama.cpp

Prerequisites: Git, a C/C++ compiler, CMake, Python with the [Hugging Face CLI](https://huggingface.co/docs/huggingface_hub/guides/cli), and enough disk space. Commands below are for macOS/Linux shells. On Windows use the runtime's Windows build instructions and equivalent paths; the Pi settings are identical.

In a directory for local engines, build a reviewed upstream revision:

```sh
git clone https://github.com/ggml-org/llama.cpp.git
cd llama.cpp
git checkout 5b59b83f4e2101ea173d4f853a0522d9971f48c6
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j --target llama-server
hf download unsloth/Qwen3.8-27B-GGUF --include '*UD-Q4_K_XL*' --local-dir models/qwen38
./build/bin/llama-server -m models/qwen38/Qwen3.8-27B-UD-Q4_K_XL.gguf --alias pi-math-qwen38 --host 127.0.0.1 --port 8080 --ctx-size 32768 --parallel 1 -ngl 99 --jinja --reasoning-format deepseek
```

The CMake command uses Metal on supported Macs; for NVIDIA CUDA add `-DGGML_CUDA=ON` when configuring and install its build prerequisites. CPU-only operation is possible but can be slow; adjust GPU offload for your hardware. Leave the server terminal open. The alias is intentional: it matches the preset. `--reasoning-format deepseek` separates reasoning from the final answer; it does not change Qwen into a DeepSeek model. [llama.cpp build instructions](https://github.com/ggml-org/llama.cpp/blob/5b59b83f4e2101ea173d4f853a0522d9971f48c6/docs/build.md), [server flags](https://github.com/ggml-org/llama.cpp/blob/5b59b83f4e2101ea173d4f853a0522d9971f48c6/tools/server/README.md).

Inside Pi, preview and apply `local-unsloth`, select its model in `/model`, then run `/math doctor` and optionally `/math doctor --probe`. The preset requests medium reasoning and the model author's thinking-mode sampling settings. To try 3-bit or 5-bit, download the exact alternative file and change `-m`; keep the alias and record the file identity in your evaluation. [Unsloth model guide](https://unsloth.ai/docs/models/qwen3.8).

## LM Studio

1. Install [LM Studio](https://lmstudio.ai/download) and its CLI. Search its model browser for **unsloth/Qwen3.8-27B-GGUF** and select **UD-Q4_K_XL**. Wait for the download.
2. Run `lms ls` to get the exact downloaded model key. Replace `YOUR_MODEL_KEY` below with that key; it is not a literal model name.
3. Preview memory, load with the matching alias/context, and start the local server:

```sh
lms load YOUR_MODEL_KEY --context-length 32768 --estimate-only
lms load YOUR_MODEL_KEY --identifier pi-math-qwen38 --context-length 32768
lms server start
```

Confirm the server is listening locally on port **1234** in the Developer panel. Choose `local-lmstudio` in Pi setup, then `/model` and `/math doctor`. The GUI can also load models, but the API identifier and context must match. Memory estimates do not establish successful runtime fit. [Loading models](https://lmstudio.ai/docs/cli/local-models/load), [OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat).

Unsloth Desktop is another model manager; its `unsloth run` uses llama-server options. Follow its [API instructions](https://unsloth.ai/docs/basics/api) to set the same alias, loopback endpoint, and context before using a matching custom Pi entry. This is an alternative frontend, not an additional tested preset.

## Bonsai: use PrismML's matching runtime

Bonsai is PrismML's model family. These 27B releases derive from **Qwen3.6-27B**, rather than Qwen3.8. The ternary release's ideal 1.71-bit storage estimate is about 5.9 GB, but its current deployed format occupies about **7.2 GB**. Working memory is additional. Do not plan a 6 GB machine around the ideal number. Author-reported retained benchmark performance is not a pi-math measurement. [PrismML release](https://prismml.com/news/bonsai-27b), [format details](https://huggingface.co/prism-ml/Ternary-Bonsai-27B-gguf).

Use a separate directory so this fork does not replace your ordinary llama.cpp installation:

```sh
git clone --branch prism https://github.com/PrismML-Eng/llama.cpp.git prism-llama
cd prism-llama
git checkout 9a9394a895b96003ca842a6041cb28ac49a108f7
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j --target llama-server
hf download prism-ml/Ternary-Bonsai-27B-gguf Ternary-Bonsai-27B-PQ2_0.gguf --local-dir models/bonsai
./build/bin/llama-server -m models/bonsai/Ternary-Bonsai-27B-PQ2_0.gguf --alias pi-math-bonsai-ternary --host 127.0.0.1 --port 8080 --ctx-size 32768 --parallel 1 -ngl 99 --jinja --reasoning-format deepseek
```

For NVIDIA, configure with `-DGGML_CUDA=ON` and the fork's CUDA prerequisites. In Pi, use `local-bonsai`. For the binary model, stop the ternary server first, then:

```sh
hf download prism-ml/Bonsai-27B-gguf Bonsai-27B-Q1_0.gguf --local-dir models/bonsai
./build/bin/llama-server -m models/bonsai/Bonsai-27B-Q1_0.gguf --alias pi-math-bonsai-1bit --host 127.0.0.1 --port 8080 --ctx-size 32768 --parallel 1 -ngl 99 --jinja --reasoning-format deepseek
```

Apply `local-bonsai-1bit`, select it in `/model`, and diagnose/probe again. These recipes load text weights only. Optional vision projectors and speculative draft models require extra files/memory and are deliberately absent. The selected PQ2_0 file uses PrismML's specialized kernels; a generic Hugging Face auto-generated loader snippet is not evidence of compatibility. The native MLX variant also has matching runtime requirements; do not assume vanilla MLX can read these GGUF files. [PrismML runtime](https://github.com/PrismML-Eng/llama.cpp/tree/9a9394a895b96003ca842a6041cb28ac49a108f7), [binary file card](https://huggingface.co/prism-ml/Bonsai-27B-gguf).

## ds4 / DwarfStar

[antirez/ds4](https://github.com/antirez/ds4) is now called DwarfStar. It is a specialized engine with its own supported model files. The Pi recipe uses **ds4-server**, not ds4-agent: Pi remains your application and pi-math remains the research workflow. Reviewed revision: `8db1d1d155cb0400a86a86b9c62d0defb3a6148b`.

For a supported large-memory Apple Silicon machine, begin with the engine's **V4 Flash 0731 Q2** download:

```sh
git clone https://github.com/antirez/ds4.git
cd ds4
git checkout 8db1d1d155cb0400a86a86b9c62d0defb3a6148b
make
./download_model.sh ds4f-q2
./ds4-server --ctx 32768
```

Upstream describes `make cuda-spark`, `make cuda-generic`, and `make strix-halo` for its other supported hardware. Follow the matching build prerequisites, rather than running all targets. Allow roughly 81 GiB for this download and the upstream 96/128 GB memory starting range. The server binds locally on port **8000** by default. Check its startup log for the loaded file and context. [Build/readme](https://github.com/antirez/ds4/tree/8db1d1d155cb0400a86a86b9c62d0defb3a6148b).

Inside Pi, preview/apply `local-ds4`, choose its model with `/model`, and run doctor/probe. The custom entry follows the upstream [Pi client guide](https://github.com/antirez/ds4/blob/8db1d1d155cb0400a86a86b9c62d0defb3a6148b/docs/CLIENTS.md): OpenAI completions, DeepSeek-style thinking, `max_tokens`, and separated reasoning. Start with high effort; the engine's max mode has additional context requirements.

**Record the file, not just the API name.** An API alias such as `deepseek-v4-flash` does not choose or prove the identity of the loaded weights. The download helper's default model symlink can change with a later download. For reproducible runs, inspect it and use the server's `-m` option with the specific file path. Save its checksum, engine commit, launch arguments, and hardware with results. [Server behavior](https://github.com/antirez/ds4/blob/8db1d1d155cb0400a86a86b9c62d0defb3a6148b/docs/SERVER.md).

V4.1 Flash is a **different deployment**, with additional disk-backed Engram data. The reviewed model guide lists Q2 around **341 GiB on disk / 152 GiB main weights**, and Q4 around **483 GiB / 294 GiB**, each including about 189 GiB of Engram storage. A 128 GB machine can use SSD streaming for the appropriate setup, with a latency tradeoff; this does not make the model an 81 GiB V4 Flash replacement. Multi-machine configurations add networking and per-node storage requirements. Use the [specific model guide](https://github.com/antirez/ds4/blob/8db1d1d155cb0400a86a86b9c62d0defb3a6148b/docs/MODELS.md) before buying hardware or downloading. The supplied preset and first recipe target V4 Flash, not V4.1.

## vLLM and NVFP4

This route is for users already comfortable managing a GPU Python environment. Unsloth's NVFP4 release requires compatible Blackwell hardware; the reviewed recipe calls for vLLM ≥0.25.0, FlashInfer ≥0.6.13, and CUTLASS DSL ≥4.5.2. Follow its [installation recipe](https://unsloth.ai/docs/models/qwen3.8#nvfp4) in a separate environment, then adapt the server launch:

```sh
vllm serve unsloth/Qwen3.8-27B-NVFP4 --served-model-name pi-math-qwen38 --host 127.0.0.1 --port 8000 --max-model-len 32768 --reasoning-parser qwen3
```

The Qwen parser must separate reasoning and final text; the preset supplies Qwen's chat-template variables. This launch is a source-derived integration recipe awaiting live validation. Confirm your installed release's parser support and record the actual versions. Upstream's [parser registry](https://github.com/vllm-project/vllm/blob/main/vllm/reasoning/__init__.py) registers `qwen3`; [reasoning documentation](https://docs.vllm.ai/en/latest/features/reasoning_outputs/) explains the boundary.

Apply `local-vllm` and run the probe. Native JSON-schema decoding also depends on the model/parser combination; consult [structured outputs](https://docs.vllm.ai/en/latest/features/structured_outputs/) before opting in. The Unsloth page contains conflicting SGLang support notes, so there is no copy-paste SGLang preset here. Resolve that against the exact release before using it.

## Verify the server and keep a record

A read-only terminal check such as `curl http://127.0.0.1:8080/v1/models` lists served IDs without generating text; substitute 11434, 1234, or 8000 for your engine. It does not prove what weights are behind an alias. Never put a remote URL into a local-only preset to work around a failing server.

After the two-call probe, complete the small theorem in the beginner guide. Then use [the six-task evaluation](EVALUATION.md) to inspect valid-proof review, false-proof rejection, missing hypotheses, repair, and an exactly checked counterexample. Record peak memory and wall time on your own machine. Keep model revision, quantization filename, runtime version, context, and effort with each result; changing any one of them creates a different experiment.
