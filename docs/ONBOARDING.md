# Your first mathematical session

**Start here even if you have never used an AI agent.** You need a little familiarity with a terminal (a window where you type commands); you do not need to understand model internals.

Three pieces work together: **the model** proposes mathematical text; **Pi** is the application you talk to; **pi-math** divides a problem into manageable questions, requests criticism, and pauses for your decisions. An “agent” is software using a model to take steps in a task. Agreement between AI reviewers is useful feedback, not a proof certificate.

## 1. Choose where the model runs

| Your situation | Start with | What you need |
| --- | --- | --- |
| You want the least setup or have an ordinary laptop | Hosted DeepSeek V4.1 Flash (`hosted-value`) | Internet and an OpenRouter account with API credit; questions go to the service |
| You want a model on your own computer and have about 24–32+ GB of available graphics/unified memory | Qwen3.8 27B in Ollama (`local-ollama`) | A large download, enough spare memory, and patience for local generation |
| You have a roughly 16 GB machine | Consider gpt-oss 20B in Ollama (`local-small`) | Check available memory first; its card describes 16 GB deployment, but other applications/context need space |
| You prefer a graphical model manager | Unsloth Qwen3.8 in LM Studio (`local-lmstudio`) | Follow the [LM Studio recipe](LOCAL-MODELS.md#lm-studio) |
| You want Bonsai, a specific Unsloth quantization, or ds4 | [Advanced local guide](LOCAL-MODELS.md) | A compatible runtime and a measured memory budget |

These are researched starting points, not measured pi-math quality rankings or guaranteed hardware fits. See the [dated recommendations](MODELS.md) and [validation record](ONBOARDING-VALIDATION.md). If you are unsure about memory, try the offline example below first, or choose hosted.

## 2. Install Pi and this extension

Install [Node.js](https://nodejs.org/en/download) 22.19 or newer and Git. Open a terminal and check:

```sh
node --version
npm --version
git --version
npm install -g @earendil-works/pi-coding-agent@0.85.1
pi --version
```

We test Pi **0.85.1**. This repository is private: your GitHub credentials must have access. Ask for repository access if cloning says “not found”. From a directory where you keep projects:

```sh
git clone https://github.com/hammer/pi-math.git
cd pi-math
npm ci --ignore-scripts
pi -e ./src/extension.ts
```

You are now inside Pi. Commands beginning with `/` below go **inside Pi**, not in the terminal. Run `/math help`: you should see pi-math's commands. Use `/math setup` to list the supplied model choices.

For regular use outside the checkout, `pi install git:github.com/hammer/pi-math` installs the extension; restart Pi or use `/reload`. Keep the checkout if you want the example files and evaluation commands.

## 3A. Connect a hosted model

Inside Pi:

```text
/login openrouter
/math setup hosted-value
```

Follow Pi's sign-in flow. Your OpenRouter API balance pays for requests; a chat subscription elsewhere does not pay this bill. Setup displays a **preview**: model name, memory note, file destination, and limits. It has not changed anything or sent a model request.

If the displayed settings are the ones you want:

```text
/math setup hosted-value --apply
/model
/math doctor
```

In the model picker, select **DeepSeek V4.1 Flash under openrouter**. Setup chooses the model for pi-math's isolated workers; `/model` chooses the model for ordinary Pi conversation. They are separate choices.

Expect “Offline configuration checks passed.” Warnings that no inference or RAM test was performed are normal. Setup preserves other provider entries, makes a private backup before changing an existing provider file, and refuses conflicting settings. It replaces this session's inference settings, including any previous role overrides. See [recovery](#if-something-goes-wrong) if it reports a conflict.

## 3B. Connect a local model with Ollama

Install and open [Ollama](https://docs.ollama.com/quickstart). Keep it running. Open a **second terminal**, still in your checkout, and download the model:

```sh
ollama pull qwen3.8:27b
```

This is about an 18 GB download. Use the local tag shown, not a cloud tag. Create a plain text file named `Modelfile` in this directory containing exactly:

```text
FROM qwen3.8:27b
PARAMETER num_ctx 32768
```

Back in that terminal:

```sh
ollama create pi-math-qwen38 -f Modelfile
ollama list
```

You should see `pi-math-qwen38`. The extra name gives us a known working-space limit: 32,768 tokens, where a token is a small piece of text. Pi's model metadata alone cannot increase Ollama's actual context. The model may load into memory only when the first request arrives. [Ollama configuration reference](https://docs.ollama.com/api/openai-compatibility).

Inside Pi:

```text
/math setup local-ollama
/math setup local-ollama --apply
/model
/math doctor
```

Select **Qwen3.8 27B via Ollama under math-ollama** in `/model`. Expect offline checks to pass and both parent and worker models to be local. These settings permit one worker at a time. Setup does not download weights or start Ollama.

For the smaller alternative, pull `gpt-oss:20b`, use `FROM gpt-oss:20b` in a separate Modelfile with the same `num_ctx`, create the name `pi-math-gpt-oss`, and apply `local-small`. Ollama supplies the model's required conversation format. The [model card](https://huggingface.co/openai/gpt-oss-20b) describes its memory and reasoning modes.

Local-only mode restricts **pi-math workers** to the configured loopback server and refuses redirects. Ordinary Pi messages use your selected parent model. You must also trust the server to use the local weights you loaded; a localhost service can itself forward requests elsewhere. Do not use cloud-backed server aliases when you intend local inference.

## 4. Optionally test the connection

`/math doctor` is offline. This additional command sends **two synthetic maths requests**, with at most 8,192 reserved output tokens in total:

```text
/math doctor --probe
```

Hosted requests may incur charges. It asks for a small calculation and criticism of a false statement. Expect a message that two checks passed. This checks communication, JSON responses, and elementary behavior. It does not certify advanced mathematics, test every worker role, or test the parent model's tool use. A failure remains visible; there is no hidden retry. If it fails, use the troubleshooting table before starting research.

## 5. Work through a theorem you can check

Start with the familiar identity 1 + 3 + ... + (2n−1) = n²:

```text
/math start Prove that for every integer n >= 1, the sum of the first n positive odd integers is n^2.
/math run
/math status
/math export
```

Read the export path Pi prints. Open `research.md` there. You should eventually reach `awaiting-route`: the AI has proposed a strategy, perhaps induction, and its reviewers have listed objections. A limit or an error can stop earlier; consult status before continuing.

Check that the proposed argument covers all integers n ≥ 1. For induction, check the base case n = 1 and the step k² + (2k+1) = (k+1)². If the proposed route is sound, type `/math approve` followed by **your reason**, then `/math run`. For example, if it really proposed induction and you checked it: `/math approve I checked the base case and induction step; this route covers the stated domain.`

The next gate is `awaiting-plan`. Read how the proof was split into sections and how the sections depend on each other. Approve with your own reason only if that plan makes sense, then run again. You may need several runs; each starts a new call budget.

After sections and global review succeed, the state becomes `awaiting-acceptance`. Read the entire argument, including objections and assumptions. Use `/math accept <your reason>` only if you accept the proof, then `/math export`. You have recorded **human acceptance**. The natural-language proof is still distinct from a machine-checked certificate.

If you disagree, use `/math reexplore <why this route fails>` or `/math amend <corrected question>`. `/math cancel` stops active work. Never approve merely to make an error disappear.

The onboarding presets use one candidate and one critic per stage (two calls, plus special calls and other stages). This makes a first session manageable. It is a smaller search than the research-paper-inspired profiles. Read [budgets](USAGE.md#configuration-and-budgets) before increasing breadth or reasoning time.

## Try the discovery example without a model

From the checkout, the following Pi commands run the supplied symbolic search and exact checks. No model or API credit is needed:

```text
/math config examples/symbolic-config.json
/math dataset examples/euler-data.json
/math discover run
/math export
```

Inspect the counterexamples and the certificate in the export. This is a deliberately small mathematical fixture; [verification instructions](VERIFY.md) explain the supplied premises and independent certificate checker. Loading this configuration replaces your previous settings. Apply your chosen model preset again before returning to model-backed proof work; also set `discoveryPolicy` to `model` in a full settings file if you want model-backed discovery.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| `/math` is unknown | Start from the checkout with `pi -e ./src/extension.ts`, or install then `/reload`. |
| No model / no configured credential | Run `/math setup`, apply the correct preset, then `/login openrouter` for hosted. Local providers use a harmless placeholder credential, not a purchased key. |
| Connection refused | Open your local model application. Verify the guide's port. If the port is already in use, do not start a second server on it. |
| Model not found / server 404 | Compare `ollama list` or the server's `/v1/models` list with the recipe's alias. A file name and an API model ID are not necessarily the same. |
| Setup reports a conflict | Read the indicated entry in Pi's `models.json`; keep a backup and merge deliberately using the [example files](../examples/providers). Do not replace the whole file with an example. |
| Setup made a backup and you want to undo it | Stop other config edits, inspect the printed backup, and restore that file manually. Reopen Pi. Session inference settings can be replaced by another preset or your saved `/math config` file. |
| Out of memory, swapping, or very slow output | Close other large apps, keep concurrency 1, try a smaller model. Reducing context must be done in both the server and the [Pi/settings entries](LOCAL-MODELS.md#memory-and-context). |
| Timed out | Check whether the server is still loading weights or CPU-offloading. Start with a smaller model/task. A new run creates a new budget; repeated hosted attempts can be billed. |
| No final answer / ended with length | Reasoning may have used the output allowance. Lower effort or deliberately increase the combined output cap within server limits; see [generation settings](MODELS.md#generation-settings). |
| Invalid JSON / schema rejected | Check the chat template and reasoning parser. Keep `structuredOutput: "prompt"` for initial setup; native schema support is opt-in and server-specific. |
| Context estimate exceeded | Narrow the problem or configure a larger actual server context and matching metadata. The diagnostic uses a conservative byte estimate, so it can reject some inputs that a tokenizer would fit. |
| Doctor warns the parent is remote | Select your local model in `/model` before ordinary conversation. `/math` commands invoke configured workers directly. |
| A mathematically false proof looks convincing | Keep the objection; test examples and hypotheses yourself. Use the [evaluation guide](EVALUATION.md) to compare this model with alternatives. |

## A few words you will encounter

- **Open weights:** you can obtain the model's numerical parameters under its license. It does not mean every hosted service is free or every license is unrestricted.
- **Quantization:** storing those numbers with fewer bits to reduce size. The resulting model can make different mistakes.
- **Runtime / inference engine:** the program loading weights and producing responses; Ollama, llama.cpp, and ds4 are examples.
- **Context:** how much text a single request can hold, including room for its answer. More context consumes memory.
- **Reasoning effort:** a model-specific request to spend more or less work before the final answer. It is not a correctness setting.
- **Worker / critic:** a separate model call that drafts or reviews one piece. It cannot grant human approval.

For advanced choices, continue to [local engines and quantization](LOCAL-MODELS.md), [model/settings reference](MODELS.md), and [reproducible evaluation](EVALUATION.md).
