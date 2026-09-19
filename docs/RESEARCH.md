# Research mechanisms and implementation boundaries

Sources read on 2026-09-19: [Stellar Colosseum, arXiv:2609.15983v2](https://arxiv.org/html/2609.15983v2) and [Discovering mathematical concepts through a multi-agent system, arXiv:2603.04528v2](https://arxiv.org/html/2603.04528v2), including their methods and appendices. The prompts here are newly written. The papers' full text and datasets are not redistributed.

## Stellar Colosseum

The essential harness idea is to spend inference on constructing, challenging and repairing mathematical objects at several scales. Separate strategy from execution; let independent attempts inform synthesis; turn review into localized, persistent obligations; verify the assembled argument again. Agreement alone is not a proof.

| Paper mechanism | Implementation | Verification |
| --- | --- | --- |
| Explore mechanisms, useful lemmas, bottlenecks, alternative routes and gateway tests before writing a proof | `StrategySchema`, `PROMPTS.explore`, `ProofEngine` exploration | Exact target and assumptions must survive unchanged; scripted route tests |
| A readiness gate distinguishes a stable architecture with localized obligations from a central unresolved idea | `GateSchema`; readiness requires stable architecture, no material unresolved objection, and only minor obligations | Unstable strategy is rejected even if the model says ready |
| Numbered outline with explicit dependencies and obligations | `PlanSchema`, `validatePlan`, `frontier` | Cycles, unknown dependencies, duplicate IDs, disconnected conclusions and uncovered obligations rejected |
| Independently construct eligible sections; retry local failures without throwing away independent work | Shared broker; DAG frontier; prior section plus feedback | Parallel local retry and preservation tests |
| Independent diverse candidates and targeted falsification | Six rotating generation perspectives; isolated worker calls; separate critic prompts | Request isolation, schemas, critic disposition tests |
| Repeated constructive aggregation over independently sampled overlapping groups | `StageRunner`; each group samples without replacement internally; new sampling per group; every synthesis is reviewed | Seeded uniformity, distinctness, overlap and reproducibility tests |
| Synthesizers must preserve useful argument structure and respond to objections | Synthesis returns a typed value plus explicit resolution proposals; proposals alone never discharge objections | Hostile synthesis cannot silently drop minority fatal objections |
| Whole-proof verification can expose incompatible assumptions or cross-section gaps | `VerificationSchema`, complete draft and local audits, all global verification objections retained across sampling | Global repair and cross-section localization tests |
| Revise locally, restructure the outline, or return to strategy | `RevisionSchema`, transitive graph invalidation, human reapproval for an outline change | Descendant invalidation and unrelated-section preservation |
| Maintain a latest draft/feedback loop and knowledge directory | Archives, prior attempts, sourced lemma/failure/reference/observation entries | Branch checkpoint and export tests; source IDs validated for curation |
| Scale the inference tree | Configurable widths, sample size, reviewer count and role models; compact and paper-size profiles | Strict shared call/output reservations and cancellation tests |

Default widths are `[4,2,1]` with sample size 3. The paper profile uses `[16,8,5,1]` and sample size 5; the paper's larger exploration setting `[32,16,8,5,1]` can be configured explicitly. Profiles do not automatically increase spending limits. The first paper's suggested future directions—semantic clustering, adaptive allocation, learned aggregation, and post-training—are not presented here as already implemented results. Graph restructuring is implemented, but no learned policy chooses its granularity.

The objection ledger is an additional defensive implementation choice. Every inherited objection needs an explicit disposition from every configured independent reviewer before removal. A reviewer can still be wrong. Claims about the target are retained even when the candidate that raised them is not sampled; all whole-proof verification objections receive this treatment. Alternative-route artifact objections can disappear when their route is not selected, with the original audit retained.

## Discovering mathematical concepts

The essential harness idea is an evolving mathematical environment: conjecturing controls search over interpretable expressions; skepticism changes which data are visible; executed proof outcomes, including failures, influence subsequent questions. The proof component belongs to the environment and does not merely express an agent's confidence.

| Paper mechanism (§§1.9–1.13 and appendices) | Implementation | Verification |
| --- | --- | --- |
| Per-patch attention weights in bounded ranges, initially including zero exposure | `DatasetSchema`, validated `Patch`, `visibleRows` | Hidden rows omitted from proposer inputs; bounds and nonempty mass checked |
| A skeptic changes a limited subset of weights; scaffolder sees the maximum across patches | `updatePatches`, `unionWeights`, `Policy.skeptic` | Max-union arithmetic, duplicate updates, unknown IDs, excessive changes and zero-mass rejection |
| Conjecturer controls number of features and operator priors | `ControlsSchema`, `Policy.control`, `regressionLoss` | Failed proof feedback changes controls; objective responds to fit and priors |
| Local feature spotters produce atoms; a separate scaffolder composes their IDs into logical expressions | `Policy.features`, `ScaffoldSchema`, `expandScaffold` | Typed arithmetic, bounded ASTs and unknown-atom rejection |
| Interpretable grammar: integer features, arithmetic, equality, conjunction, implication, negation | Exact BigInt interpreter; no expression evaluation through JavaScript `eval` | Unsafe integers, bad variables, ill types, excessive depth rejected |
| Weighted data fit and structural priors shape regression | Bounded enumerator ranks the log of a paper-inspired nested-exponential objective, plus a small complexity regularizer | Objective tests and actual offline enumerative runs |
| Deterministic translation with selected premises; no unconstrained autoformalization | Integer AST → exact linear certificate or fixed Lean source with explicit quantifiers and premises | Independent certificate checker, goal hashes, Lean source/axiom tests |
| Provability feedback ρ=1 for a found proof, 0 otherwise; zero still changes later conjecturing | `Prover`, `checkedFeedback`, `PolicyFeedback` | Unsuccessful proof feedback returned next round; stale evidence rejected |
| Nondegeneracy and background-knowledge management | Detect known premises, tautologies, vacuous implications, absent premise witnesses; human-only premise promotion | Nondegeneracy and inconsistent-environment cases |
| Bounded episodes, a large terminal reward and a small complexity reward, competitive skeptical reward | Recorded `reward`, maximum 50 rounds, stop only for checked nondegenerate statement | Full discovery trace and termination checks |
| Retain definitions and evidence of how the data/proof interaction changes questions | `definitions`, complete round history, weights before/after, premise snapshots, proof outcomes | Export and restored-history validation |
| Test the interaction by removing components | Full, no-skeptic, no-proof-feedback and regression-only modes | `npm run ablate`; paired seeds, identical fixture and round caps |

## Deliberate adaptations

1. **Policy implementation.** The paper trains agents with MADDPG and uses PySR. This extension provides isolated model policies and a small deterministic symbolic baseline, behind a replaceable `Policy` interface. Recorded rewards are observations; no gradient update, replay buffer, centralized critic or learned equilibrium is claimed. The LLM policy receives priors as instructions; it does not numerically optimize the regression loss. The symbolic baseline uses that objective directly.
2. **Restricted prover.** The default prover certifies rational linear combinations of equality premises, including conjunctions and conditional goals. It is useful and independently checkable but incomplete. The optional Lean adapter has a fixed tactic and mathematical vocabulary. Neither proves arbitrary natural-language output from the proof workflow.
3. **Nondegeneracy.** The paper discusses discouraging formulas true throughout its dataset and adding some to background premises. Here, `allDataTrue` is visible evidence, not automatic rejection: valid theorems can hold throughout a finite sample. Actual tautologies, vacuous hypotheses and already supplied premises are blocked. A human chooses when a checked conjecture becomes background knowledge. This is a conscious change for a human research tool.
4. **Rewards.** This implementation records bounded complexity/terminal rewards with a small skeptical update reward. These are transparent engineering choices, not the paper's trained reward schedule or discounting process. They are not proof of mathematical interestingness.
5. **Mathematical dataset.** The six-row Euler fixture is hand-written educational data with rank/nullity features and explicit rank-nullity premises. It is not the paper's triangulation dataset. `demo.ts` supplies its candidate identities; `ablate.ts` actually enumerates candidate expressions. Neither is a claim to independently rediscover homology.
6. **Human authority and resource limits.** Route/plan approval, acceptance, cancellation, budgets and branch-safe provenance adapt both systems to an interactive Pi user. Any proof/strategy judgment made by a model remains fallible.

## Pi sources and compatibility

Read Pi's [extension](https://pi.dev/docs/latest/extensions), [SDK](https://pi.dev/docs/latest/sdk), and [package](https://pi.dev/docs/latest/packages) documentation, and checked the actual installed types/runtime of `@earendil-works/pi-coding-agent@0.85.1`. The moving documentation described APIs that differed from that package; the adapter uses its actual `modelRegistry.complete`, not an assumed streaming API. `test/integration.test.ts` imports Pi's real extension loader. Runtime peers use `*` as recommended for Pi packages, while development dependencies pin the tested version. Other releases require retesting.
