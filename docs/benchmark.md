# Release-contract benchmark

This benchmark tests the application's deterministic release policy. It does not measure AI accuracy, image quality, content safety, legal rights, or model-backed agent performance.

## Dataset and method

`benchmarks/release-contracts-v1.json` contains exactly thirty labeled cases: three valid output recipes and twenty-seven expected blocks. Cases cover absent or rejected approval, incomplete attestations, source/version mismatch, altered inspection facts, wrong recipe or dimensions, changed transformation, mismatched review identity/checksum, expired or future timestamps, missing derivative, and unapproved extra fields.

`lib/benchmark/run.ts` constructs a complete synthetic run, applies each named case's mutation, and calls the same pure `evaluateRelease` used by the real API. Expected decisions and reason codes are fixed in the dataset, not derived from the policy result. A fixed reference clock keeps boundary cases reproducible; `generatedAt` records when the checks were rerun.

## Verified result

Measured October 14, 2026 using Next.js 16.4, Node.js 24, and the repository's current release policy:

| Metric                 | Definition                                                    | Result |
| ---------------------- | ------------------------------------------------------------- | -----: |
| Contract checks passed | Both actual allow/block and reason code match the fixed label |  30/30 |
| False releases         | A labeled blocked case is incorrectly allowed                 |   0/27 |
| False blocks           | A labeled allowed case is incorrectly blocked                 |    0/3 |

These intentionally constructed contract cases are regression coverage, not an independently sampled real-world distribution. Passing them does not prove broad production reliability or secure authorization. Session, origin, provider-failure, and actual delivered-byte checks are evaluated separately by unit and browser/API tests.

## Reproduce

Open [/benchmark](http://localhost:3002/benchmark), select **Run contract benchmark**, inspect the rows, and download results.

```bash
curl http://localhost:3002/api/benchmark
pnpm exec vitest run lib/benchmark/run.test.ts
```

No provider requests, uploads, transformations, or AI calls are made by the evaluator.

## Keep the original research question separate

The original brief proposed comparing monolithic planning, a fixed workflow, and typed model-backed specialists on thirty media tasks. That experiment requires a model provider, a labeled media-task corpus, matched execution settings, an evaluation budget, and separate outcome/latency/cost measurements.

It remains unimplemented. Do not present these contract results as evidence for that comparison or borrow results from the Raven paper. The completed application is a reproducible deterministic workflow and release-gate demo.
