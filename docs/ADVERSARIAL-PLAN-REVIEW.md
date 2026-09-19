# Adversarial review of the plan

Performed before implementation by the implementing assistant in a separate review pass. This is a self-review, not an independent external review.

## Findings and mandatory changes

| Severity | Attack on the initial design | Required change and verification |
| --- | --- | --- |
| Critical | An aggregator says “fixed” and erases a fatal counterexample. | Carry immutable objection IDs and full records; only separate review or an explicit human disposition can discharge them. Test hostile aggregation and minority objections. |
| Critical | A proof section changes but downstream accepted sections survive. | Compute transitive invalidation for body, task, dependency, assumption and target changes. Reverify the assembled proof. Test diamond graphs and unrelated branches. |
| Critical | A model claims an experiment ran or a theorem was proved. | Worker prose never creates machine evidence. Only executed evaluation/certificate/prover code creates that evidence, bound to exact statement and premises. |
| Critical | A conjecture proves itself through inconsistent premises or a vacuous implication. | Validate types, premise witnesses and nondegeneracy; distinguish “not proved” from “false”; reject stale and mismatched certificates. |
| High | Session navigation restores the newest state from another branch. | Restore only from `getBranch()`. Persist immutable checkpoint references. Abort work before branch changes and prevent late writes. |
| High | Concurrent workers overspend a shared budget or run forever. | Reserve calls and output tokens before dispatch; share one semaphore; explicit request deadlines, total call limits and cancellation. No automatic retries hidden from accounting. |
| High | A missing dependency or malformed model JSON is interpreted as success. | Strict runtime schemas and DAG validation. Failed inference remains a failed attempt; state never advances on malformed output. |
| High | A dataset contains code, unsafe integers, or features hidden from the conjecturer. | No `eval`; exact integer AST interpretation; bounded sizes and depths; explicit visible-patch projections; holdout data withheld from proposer contexts. |
| High | A “Lean check” only compiles `True` or uses `sorry`. | Deterministic goal translation; fixed proof tactic; bind source hash and premise set; inspect theorem axioms; compilation failures/timeouts remain unknown. |
| High | The wrapper inherits the parent agent's tools and writes uncontrolled files. | Independent tool-free nested calls through Pi's model registry. External prover execution is separately configured, argument-array only, bounded and cancellable. |
| Medium | The second paper is reduced to a generic critic prompt. | Implement per-patch bounded weights, max-union visibility, feature-spotter/scaffolder separation, proof feedback, controller updates, skepticism and trajectory exports. |
| Medium | The project claims to reproduce MADDPG/PySR or the benchmark. | Document the LLM/heuristic policy adaptation, deterministic restricted prover and lack of empirical replication. Expose interfaces and ablations for later research. |
| Medium | Human approval becomes just another model-callable tool field. | Approval and final human acceptance exist only in slash commands, bound to the current artifact. A model can propose but cannot approve. |
| Medium | Happy-path mocks hide API or packaging errors. | Typecheck against the published Pi package, load the extension with Pi's real loader, test installable package contents and the adapter's request/response contract. |

## Disposition

Proceed with the revised plan. Publication access is an operational dependency, not a reason to weaken tests. Final release must report unexecuted optional integrations and unresolved limitations explicitly.
