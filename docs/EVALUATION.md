# Evaluate your model before relying on it

The diagnostic probe checks basic communication. This six-task suite checks more of the behavior pi-math needs, while keeping the cost bounded. It uses the actual worker broker, adapter, and proof/review schemas. It does not replace a complete proof workflow with human gates, measure frontier mathematical ability, or establish a winning model from six examples.

The checked-in manifest and separate human rubrics are in [`src/evaluation.ts`](../src/evaluation.ts), revision `math-onboarding-v1`. Cases cover an elementary proof, a valid proof to review, a plausible false proof, a missing hypothesis, a conjecture requiring a concrete counterexample, and a repair with an explicit new hypothesis. Rubrics are not included in model requests. Outputs are scored by people, except the integer counterexample, which is checked exactly with integer arithmetic.

## Preview without sending requests

From the checkout after `npm ci --ignore-scripts`:

```sh
npm run evaluate -- --preset local-ollama
```

Expect a JSON plan followed by “No files changed; no model requests sent.” The default is **six sequential requests, 4,096 output tokens each, at most 24,576 reserved output tokens**, without retries. No model registry or credentials are read in dry-run mode. You can preview other presets and caps the same way.

## Run the six requests explicitly

First configure your model through Pi's `/math setup ... --apply` and run `/math doctor`. Leave a local server running if using one. Then, in the terminal:

```sh
npm run evaluate -- --preset local-ollama --live --out test-output/models/qwen-local-01.json --label 'Qwen3.8 27B; Ollama VERSION; model digest DIGEST; MACHINE and RAM; context 32768'
```

Replace the capitalized label placeholders with the values from your machine and model manager. For hosted models, label the endpoint, snapshot if known, actual upstream route, and date. For GGUF/ds4, record the filename, checksum, engine commit, GPU/CPU and memory, context, cache precision, and launch command. Unknown provenance should say **unknown**, not be inferred from an API alias.

`--live` may incur hosted charges. Token reservations are not a dollar cap. The output file must be new; the command refuses to overwrite it before making any model call. It uses Pi's existing auth and provider file, with no second credential store or automatic catalog network refresh. It records progress after each case and handles Ctrl-C cancellation. A request failure remains in the report. A timeout cancels the broker and prevents further dispatches; skipped/failed cases are not successes.

The report contains exact prompts and responses, model identifiers, effective requested settings, endpoint origins, configuration/task hashes, call timestamps, usage, errors, exact-counterexample results, and blank human judgments. It records timestamps rather than token-stream latency; subtract start/end for wall time. Cost is the Pi/provider metadata estimate when available, not a reconciled invoice. Peak RAM/VRAM and actual weight identity require your separate measurement. Files are created with owner-only permissions where supported; the chosen directory is yours to manage.

## Judge the mathematics

Keep the original report unchanged and write a separate review file with each case ID, judgment, reviewer, and reason. For every output, first ask whether it parsed and completed; then ask whether its mathematics was correct. A case marked `returned` means schema-valid output, **not** a passed proof. `humanJudgment` stays null until a human adjudicates in the separate review record.

Check the proof's base case, induction step, and domain. On the reviewer cases, identify whether each objection is real and material. On repair, make sure the model retains the amended hypothesis. On the counterexample, `exactWitness: true` confirms the integer domain and a proper divisor of n²+n+41; it establishes that one counterexample only. If you disagree with an automatic witness result, independently multiply and divide the reported integers.

For these three review cases, treat the flawed and missing-hypothesis arguments as positives for **material error detection**. Count a true positive only if the reviewer locates a real material error; a spurious fatal objection to the valid proof is a false positive. Report precision TP/(TP+FP) and recall TP/(TP+FN), with undefined denominators shown as undefined. With only three cases these are sanity checks, not statistically reliable quality estimates. Have a second reviewer assess contested outputs without seeing model names when feasible.

For the machine-certificate boundary, also run:

```sh
npm run demo
npm run verify:certificate -- test-output/demo/certificate.json
npm run ablate
```

Those execute the existing exact discovery/checking fixture independently of the language model. See [VERIFY.md](VERIFY.md) for premises, counterexamples, and supported linear certificates. Changing the language model does not extend the Lean adapter's expression language or tactic support.

## Compare models fairly

Use the same manifest revision, output caps, context bounds, and repetitions. The runner removes explicit thinking-token splits for the matched-cap comparison, uses concurrency 1, and retains the selected preset's supported effort/sampling unless you override effort. Inspect the printed plan. The same cap is only a matched reservation, not identical compute: models tokenize and spend reasoning differently. Record actual usage and elapsed time; compare costs against real billing where necessary.

```sh
npm run evaluate -- --preset hosted-value --max-output 4096
npm run evaluate -- --preset hosted-kimi --max-output 4096
npm run evaluate -- --preset hosted-qwen --max-output 4096
```

These remain dry runs. Add `--live`, a unique `--out`, and a provenance `--label` to each run only when ready. Repeat, rather than trusting one sample. Reviewers should distinguish truncation caused by the cap from incorrect completed reasoning. More demanding trials can use `--max-output 16384` and a supported `--effort`; label that a separate quality track. If local metadata or context rejects the cap, fix the actual server/model configuration deliberately; the CLI does not bypass it.

For homogeneous versus mixed-family review, copy and edit a complete settings file and pass `--settings project-settings.json`. This reads pi-math settings only; providers must already exist in Pi. Configure both model and generation role overrides. The preset still supplies the CLI's fallback parent model. Compare the same cases and human judgments; do not claim independent errors merely because the critic has a different name.

Parent-agent tools are a separate optional acceptance exercise. In a fresh Pi session after selecting the model, ask it to use `math_research` with action `status`, and inspect that actual tool invocation. This single conversation may be billed and is governed by Pi's parent settings, not the six-call runner's budget. A successful worker suite does not prove tool compatibility. The slash-command workflow works without parent tool calls.

Before calling a recipe live-tested, also complete the beginner theorem through its route/plan gates and export, cancel a running request, and inspect the recovered state. Store the report, human judgments, software versions, hardware, and failures together. Update the preset status only with that evidence. No live model quality results are bundled in this release.
