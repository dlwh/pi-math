# Pi Math

A human-guided mathematical research extension for [Pi](https://pi.dev/). It turns a question into a reviewed strategy, a dependency-aware proof plan, independently critiqued section drafts, and a whole-proof review. A complementary discovery loop proposes conjectures from weighted data, exposes counterexamples, and feeds executed proof outcomes back into the next search.

Implemented from the harness ideas in [Stellar Colosseum](https://arxiv.org/abs/2609.15983) and [Discovering mathematical concepts through a multi-agent system](https://arxiv.org/abs/2603.04528). See the [paper-to-code map](docs/RESEARCH.md) for mechanisms, tests, and explicit adaptations. This project does not reproduce either paper's trained policies, benchmark scores, or discoveries.

## Install

Requires **Node 22.19+** and **Pi 0.85.1**; the integration is tested against that published version. With GitHub credentials that can read this repository:

```sh
pi install git:github.com/hammer/pi-math
```

Then start Pi, or run `/reload` in an existing session. Pi resolves the package's extension entry and runtime dependencies. Alternatively, for development:

```sh
git clone https://github.com/hammer/pi-math.git
cd pi-math
npm ci --ignore-scripts
pi -e ./src/extension.ts
```

Use a project you trust in Pi and select an authenticated model. Nested workers use Pi's model registry and scoped-model restrictions. They have isolated contexts and no tools.

## Work on a proof

```text
/math start Prove that every finite subgroup of the multiplicative group of a field is cyclic.
/math run
/math status
```

The run stops at a human gate. Inspect the proposed mechanism, assumptions, obligations, and objections. If the route is suitable, use `/math approve <reason>`, then `/math run`. Inspect and approve the section plan at the next gate. Further runs construct eligible sections, retry local failures, and review the assembled proof. Budgets or errors can stop a run earlier; `/math status` explains the state.

Use `/math reexplore <reason>` when the central idea fails, or `/math amend <new target>` to change the problem and invalidate the current argument. Record reusable observations through the `math_note` tool. After global review succeeds, `/math accept <reason>` records **human acceptance**, which is separate from a formal certificate. `/math export` writes the draft and complete audit as Markdown, LaTeX, and JSON.

The default `[4, 2, 1]` sampling tree is deliberately small. Every node is separately reviewed. A single stage with one reviewer uses 14 model calls, plus any stage-specific knowledge curation. `/math config` displays limits; `/math cancel` cancels current work. Read [configuration and budgets](docs/USAGE.md#configuration-and-budgets) before increasing widths.

## Explore conjectures

From this checkout, an offline symbolic policy can run without model credentials:

```text
/math config examples/symbolic-config.json
/math dataset examples/euler-data.json
/math discover run
/math export
```

The default discovery policy uses models instead. Both policies follow the same controller → local feature spotters → logical scaffolder → executed check → skeptical data update loop. Zero-weight rows are withheld from proposers. Only the skeptic and exact evaluator see the whole dataset. Unknown proof outcomes are returned as feedback, never treated as counterexamples.

`/math use-conjecture` moves the last conjecture and its explicit premises into the proof workflow. `/math premise <reason>` can add a machine-checked conjecture to the discovery background. See the [dataset and expression reference](docs/DATA.md).

## Verify the implementation

```sh
npm ci --ignore-scripts
npm run check
npm run demo
npm run verify:certificate -- test-output/demo/certificate.json
npm run ablate
npm pack --dry-run
```

These checks need no API keys or Lean installation. Tests include the real Pi extension loader, scripted orchestration failures, concurrency and cancellation, immutable branch restoration, exact arithmetic, independent certificate verification, and actual bounded subprocesses. The demo and ablations execute the mathematics and symbolic search they report. Scripted model tests verify orchestration, not the quality of a live model's proofs.

An optional Lean adapter runs a deterministic translation in a locally configured mathlib project. Lean source generation and process handling are tested; a live Lean/mathlib run and a paid model run are separate [acceptance exercises](docs/VERIFY.md). No automatic natural-language-to-Lean correctness claim is made.

## Read and review

- [User guide, command reference, and budgets](docs/USAGE.md)
- [Paper mechanisms and adaptation boundaries](docs/RESEARCH.md)
- [Architecture, state, and extension points](docs/ARCHITECTURE.md)
- [Dataset, expression language, and proof evidence](docs/DATA.md)
- [Verification and reproducible review](docs/VERIFY.md)
- [Implementation plan](docs/PLAN.md) and [adversarial plan review](docs/ADVERSARIAL-PLAN-REVIEW.md)
- [Adversarial code review and verification record](docs/ADVERSARIAL-CODE-REVIEW.md)
- [Executed example evidence](docs/evidence/demo.json) and [ablation trajectories](docs/evidence/ablations.json)
- [Incremental work issues](https://github.com/hammer/pi-math/issues?q=is%3Aissue)

Research files contain your mathematical questions and full worker prompts/responses. They stay in the current project's `.pi/math/` unless you export or share them. Preserve that directory with the corresponding Pi session to resume its checkpoints. The repository ignores it by default.
