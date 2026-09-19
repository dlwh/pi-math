# Implementation plan

Prepared before implementation, 2026-09-19. Repository: `hammer/pi-math`.

## Goal and boundary

Make Pi a human-guided mathematical research workbench. Implement the orchestration mechanisms from both papers, with replaceable model and prover interfaces. This is an implementation of their harness ideas, not a reproduction of their training, proprietary harness, benchmark results, or mathematical discoveries. A passing software test cannot establish that an arbitrary generated proof is correct.

Sources read: [Stellar Colosseum, v2](https://arxiv.org/html/2609.15983v2), [Discovering mathematical concepts, v2](https://arxiv.org/html/2603.04528v2), Pi's [extensions](https://pi.dev/docs/latest/extensions), [SDK](https://pi.dev/docs/latest/sdk), and [packages](https://pi.dev/docs/latest/packages). Target the actual published Pi 0.85.1 API; do not assume older `@mariozechner` imports work.

## Incremental work

| Chunk | Deliverable | Acceptance evidence |
| --- | --- | --- |
| 1 | Requirements, plan, adversarial review, issue specifications | Sources and every mechanism mapped; risks have concrete mitigations |
| 2 | Typed research state, durable checkpoints, DAG operations | Malformed state, cycles, stale dependencies, corruption and branch replay tests |
| 3 | Bounded model runner and adversarial sampling tree | Independent overlapping samples, critiques preserved, reservations, cancellation and failure tests |
| 4 | Proof workflow and revision routing | Exploration through global review; readiness obligations; local retries; affected descendants invalidated |
| 5 | Discovery environment and verifiable proof feedback | Typed symbolic expressions; patch weights; feature/scaffold/skeptic cycle; nondegeneracy; exact certificates; optional Lean |
| 6 | Pi integration and human controls | Real package loading; tools, commands, branch restoration, approval isolation, context, exports |
| 7 | Examples, ablations, documentation, verification | Offline end-to-end runs, API integration, CI, installation and reviewer instructions |
| 8 | Adversarial implementation review and release | Regressions fixed; reproducible verification report; repository and issue status reconciled |

Dependencies: 1 → 2 → 3 → 4; 2 + 3 → 5; 4 + 5 → 6 → 7 → 8. Each chunk is committed separately. Issue definitions are maintained in `docs/issues.json`; GitHub issue numbers are recorded after creation rather than guessed.

## Architecture

The deterministic core owns transitions and evidence. A model adapter only returns schema-validated proposals. A shared scheduler bounds concurrency and inference; worker contexts are independent and have no tools. Stage inference generates diverse candidates, separately critiques each, synthesizes independently sampled overlapping groups, and critiques synthesized nodes again. Structured objections survive until a separate reviewer supplies a reason to discharge them.

The proof engine advances a dependency graph. The discovery engine controls an explicit mathematical environment: typed expressions, visible weighted data patches, background premises, proof feedback, and versioned conjectures. Both retain attempts and provenance. Pi provides commands, tools, model authentication, cancellation, and session history. Immutable checkpoints are referenced from the current Pi branch, not a global mutable “latest” file.

## Human experience

Start a question, inspect proposed routes, approve a route and plan, run bounded proof work, inspect local and global objections, amend or re-explore, export the audit. Discovery can start from a numeric dataset, alternate feature discovery and skeptical data selection, and feed proposed conjectures back into proof work. Target changes, human acceptance and promotion of premises are explicit human commands. Machine review, exact algebraic certification, external Lean checks and human decisions remain separate evidence classes.

## Verification policy

Use actual Pi types and loader, deterministic fake-model traces for failure-path coverage, seeded mathematical/property tests, subprocess tests, and an offline worked example with independently checked arithmetic. No paid provider call is necessary for the baseline suite. Live model quality and an installed Lean/mathlib environment are optional acceptance exercises, not silently simulated successes. Compare ablations under the same seeds and limits; report what the experiment measures without claiming replication of the papers.

See [ADVERSARIAL-PLAN-REVIEW.md](ADVERSARIAL-PLAN-REVIEW.md) for the pre-implementation challenge and the adopted revisions.
