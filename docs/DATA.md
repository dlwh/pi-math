# Mathematical data and evidence

## Dataset schema

Use [euler-data.json](../examples/euler-data.json) as a complete example. A dataset has:

| Field | Meaning and bounds |
| --- | --- |
| `description` | Mathematical meaning and provenance of the features; this is visible to proposers, so do not include hidden row values here. |
| `features` | 1–24 distinct safe variable identifiers |
| `rows` | 1–1,000 distinct IDs, each with exactly the declared feature keys and safe integer values |
| `premises` | Up to 32 well-typed Boolean expressions; these are assumptions, not data-derived facts automatically trusted as universal |
| `patches` | 1–8 distinct patch IDs; one weight per row in `[0,1]`, at least one positive weight per patch |

JavaScript safe integers are accepted as input and converted to BigInt for exact expression evaluation. Intermediate arithmetic can exceed the safe-integer range without rounding. Arbitrary floating-point data, division, real variables and quantified ASTs are not supported.

Weight zero omits a row from a feature spotter's context. The scaffolder receives rows with their maximum weight over all patches. The skeptic receives the full dataset and can update at most `ceil(rowCount * patchCount / 4)` distinct patch/row pairs per round, with a minimum allowance of one. Patches cannot become empty.

## Expression grammar

| Mathematical syntax | JSON AST |
| --- | --- |
| Integer 2 | `{"kind":"int","value":2}` |
| Variable V | `{"kind":"var","name":"V"}` |
| ¬P | `{"kind":"not","arg":P}` |
| A + B / A − B / A × B | `{"kind":"add"|"sub"|"mul","left":A,"right":B}` |
| A = B | `{"kind":"eq","left":A,"right":B}` |
| P ∧ Q / P ⇒ Q | `{"kind":"and"|"implies","left":P,"right":Q}` |

The alternatives shown with `|` are explanatory notation, not literal JSON. Actual objects use exactly one `kind`. Expressions are bounded to 127 nodes and depth 20. Arithmetic/equality require integer operands; logical connectives require Boolean operands. Conjectures and premises must be Boolean. No JavaScript or shell fragments are evaluated.

A feature spotter returns atomic propositions and optional proposed definitions. The scaffolder can use only the assigned atom IDs with `and`, `implies` or `not`; it cannot invent a new atom during combination. Final expressions receive the same size/type checks as imported ones.

## Evidence classes

| Evidence | What it establishes |
| --- | --- |
| Model review | A recorded model judgment with explicit objections. It may be wrong or share another worker's mistakes. |
| Exact empirical check | Truth values on all supplied rows satisfying the premises, with exact counterexample IDs. A finite sample does not establish a theorem. |
| `certified` | The independent algebra checker verified a linear-combination certificate for the exact AST under the exact premises. |
| `lean-checked` | The configured Lean process accepted the deterministic translated goal and produced an allowed axiom report. The compiler/project are trusted. |
| `unknown` | The prover did not find a supported proof. It does not establish falsity. |
| `error` | Prover execution failed, timed out, or exceeded a resource limit. |
| Human acceptance | A named decision point with reason and artifact hash. It is separate from machine evidence. |

The algebra producer solves for rational coefficients using exact Gaussian elimination. The checker independently recomputes the claimed polynomial identity from those coefficients; it never invokes the producer. Rational coefficients are sound for integer-valued equalities because integer solutions also satisfy the equalities over the rationals. It supports linear equalities, conjunctions and implications by extending the local premise context. Unsupported nonlinear expressions or other logical structures yield unknown. The checker has no theorem about the intended interpretation of variables; humans must inspect that translation.

Certificates bind the complete statement and premise arrays by SHA-256, including ordering. Every discovery round retains its premise snapshot so later promotion does not rewrite earlier evidence. A proof that conflicts with a premise-satisfying data row triggers an error. A proved conjecture cannot terminate discovery if it is a known premise, a detected tautology, vacuous on the data, or has no premise witness. These checks are conservative research filters, not a complete formal definition of interestingness or satisfiability.

## Euler fixture

Features `V,E,F` describe counts; `r1,n1,r2,n2` give the supplied ranks/nullities. The two background equalities are `r1+n1=E` and `r2+n2=F`. Initially visible rows are sphere examples. The naive statement `V−E+F=2` fits those rows but fails on the torus and two-sphere disjoint union rows. The sphere-plus-torus row happens to have Euler characteristic 2 and is not a counterexample.

The supplied corrected identity is

\[
V-E+F=(V-r_1)-(n_1-r_2)+n_2.
\]

It follows algebraically from the two premises; the example obtains and independently verifies coefficient weights `1` and `−1`. Interpreting the right-hand terms as homological dimensions requires the relevant chain-complex facts; those are not proved by this integer certificate. The fixture is educational, not a generated corpus of independently validated triangulations.
