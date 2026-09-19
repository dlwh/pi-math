# Adversarial implementation review

2026-09-19. A separate self-review pass by the implementing assistant; no independent human or external-agent review is implied. The review used the pre-implementation findings in [ADVERSARIAL-PLAN-REVIEW.md](ADVERSARIAL-PLAN-REVIEW.md), actual Pi APIs, hostile scripted worker outputs, and executable regression tests.

## Findings resolved

| Severity | Finding | Fix and regression evidence |
| --- | --- | --- |
| High | `Promise.all` could return after one failed candidate while siblings continued writing artifacts. Releasing the operation mutex at that point could expose a later session to those writes. | Parallel tree generation, critique, synthesis and discovery feature work now drain all sibling promises before returning. `a failed parallel tree drains sibling work...` holds a sibling open, verifies the operation stays live, then checks no artifacts arrive after return. |
| High | Explicit re-exploration cleared the current global review. Its unresolved objections were visible in history but were not mandatory inherited objections on the new strategy. | Inherit unresolved current or archived whole-proof objections when the target is unchanged. `re-exploration cannot discard...` tests a fatal counterexample that a later critic ignores. The readiness gate stays closed. |
| High | Restoration validated Lean statement/premise hashes but only required execution evidence to exist. A mismatched source or failed compiler record could be accepted from a malformed checkpoint. | Recompute the deterministic source hash, require zero exit status and recheck the theorem's allowed axioms. Tests reject wrong source, nonzero exit and `sorryAx`. These are evidence-validation fixtures, not a live compiler run. |
| High | Cold initialization initially marked state loaded before its asynchronous restore completed. A concurrent status read and mutation could therefore bypass the restored project's replacement guard. | Share and await the restoration promise; retain restoration failure; serialize mutations before their first await. Concurrent status/start and mutation/mutation tests preserve the old checkpoint. |
| Medium | Feature outputs were checked as Boolean propositions, so a spotter could hide an entire logical scaffold in one atom. | Require arithmetic equality atoms; only the separate scaffolder performs logical composition. A deliberately nested implication is rejected. |
| Medium | The current checkpoint path could remain from another session branch after restoration. | Recompute the displayed path from the restored branch entry, or clear it for an empty branch. |
| Medium | The worked-example test initially treated the sphere-plus-torus row as an Euler counterexample, although its Euler characteristic is 2. | Corrected the assertion to the torus and two-sphere rows; documented the distinction and retained exact computation. |
| Medium | Moving Pi documentation differed from the published model-registry API. | Implement against 0.85.1's `complete`, typecheck actual package types, and load the extension through Pi's real loader. |

Source files were formatted for direct review after the fixes. Complete candidate, critique, synthesis and provider-error records remain exportable. No test substitutes a model's claim that a command ran for executed evidence.

## Verification record

Local environment: Node 24.19, npm lockfile install, Pi coding-agent and pi-ai 0.85.1. The final verification commands and outcomes are also reproducible using [VERIFY.md](VERIFY.md):

| Check | Result |
| --- | --- |
| Clean `npm ci --ignore-scripts` | 262 packages installed successfully |
| `npm run check` | Strict TypeScript check; 40 passing tests, no failures or skips |
| Real Pi extension loader | Four tools and the human `/math` command loaded successfully |
| `npm run demo` and independent certificate verifier | Exact counterexamples identified; supplied corrected identity certified under its explicit premises |
| `npm run ablate` | 20 actual symbolic episodes across four modes; complete deterministic trajectories recorded |
| Repeated seeded ablation | Output compared byte-for-byte with the original run |
| `npm pack --dry-run` | Extension sources, runtime metadata, examples and documentation included |
| GitHub Actions | Workflow runs the same credential-free checks on Node 22.19 and 24; consult the commit's Actions status for remote execution results |

The suite includes 100 seeded certificate cases, independent coefficient checking and tampering, exact integer overflow avoidance, invalid graphs, context/call/output limits, cancellation against an uncooperative model, and branch lifecycle restoration. A dedicated test runs the complete model-policy protocol through real JSON schemas while checking hidden-row boundaries.

## Remaining boundaries

- No paid/live model call or actual Lean/mathlib compiler invocation was performed during this implementation. Those optional exercises have explicit instructions and must be recorded separately. The test suite uses scripted model messages and real ordinary subprocesses.
- Free-form mathematical proofs remain subject to model and human error. Independent prompts do not ensure statistically independent mistakes, and a human acceptance record is not a formal proof.
- The algebra checker proves only its supported fragment under supplied premises. It shares AST/rational helpers with the producer. Independent manual inspection or a separate Lean run provides additional assurance.
- Imported data descriptions, premises and feature meanings are mathematical assumptions that the human must inspect. Nondegeneracy checks are bounded, incomplete research filters.
- The policy adapters implement the papers' feedback and orchestration structure, not MADDPG training, PySR, the original datasets, the original benchmark results, or an autonomous rediscovery claim.
- Provider input/thinking-token costs and billing after cancellation are outside the output-reservation budget. A new invocation has a fresh inference budget.
- The project filesystem and configured Lean/mathlib installation are trusted. Hashes detect accidental object changes; they are not signatures against a local adversary who can rewrite both objects and session references.
- Partial aggregation stages are auditable but recomputed after interruption. Exported JSON is portable for review; automatic importing and checkpoint migration are not implemented.

Disposition: the implemented software acceptance criteria pass. Broader claims about mathematical discovery quality require independent evaluation on suitable tasks, providers and formal environments.
