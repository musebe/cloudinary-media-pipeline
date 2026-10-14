import rawDataset from "@/benchmarks/release-contracts-v1.json";
import {
  runSchema,
  type ExecutionRun,
  type HumanReview,
} from "@/lib/execution/contracts";
import { createInspection, evaluateRelease } from "@/lib/execution/policy";
import type { VerifiedAsset } from "@/lib/ingestion/contracts";
import type { PipelineRecipe } from "@/lib/pipeline/contracts";

import {
  benchmarkDatasetSchema,
  benchmarkResultSchema,
  type BenchmarkCaseResult,
  type BenchmarkResult,
  type BenchmarkScenario,
} from "./contracts";

export const benchmarkDataset = benchmarkDatasetSchema.parse(rawDataset);
const referenceSeconds = Date.parse(benchmarkDataset.referenceTime) / 1_000;
const sourceId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const otherSourceId = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const runId = "11111111-1111-4111-8111-111111111111";
const otherRunId = "22222222-2222-4222-8222-222222222222";
const sourcePublicId = `media-pipeline/originals/${runId}`;

const timeAt = (seconds: number) => new Date(seconds * 1_000).toISOString();

// These independent fixture specifications are not derived from the policy's
// recipe builder, so changing production transformations can reveal a mismatch.
const fixtureRecipes = {
  storefront: {
    width: 1_200,
    height: 1_200,
    transformation: "b_white,c_pad,h_1200,w_1200/q_80",
  },
  social: {
    width: 1_200,
    height: 630,
    transformation: "c_fill,g_center,h_630,w_1200/q_80",
  },
  catalog: {
    width: 1_600,
    height: 1_600,
    transformation: "b_white,c_pad,h_1600,w_1600/q_80",
  },
} as const;

function createApprovedFixture(recipe: PipelineRecipe): ExecutionRun {
  const asset: VerifiedAsset = {
    assetId: sourceId,
    publicId: sourcePublicId,
    version: 42,
    width: 1_870,
    height: 1_250,
    bytes: 379_132,
    format: "jpg",
    resourceType: "image",
    deliveryType: "authenticated",
    verifiedAt: timeAt(referenceSeconds - 120),
    recipe,
    prompt: "Synthetic release-contract benchmark fixture.",
    status: "verified",
    executionComplete: false,
  };

  return runSchema.parse({
    id: runId,
    kind: "demo",
    recipe,
    prompt: asset.prompt,
    asset,
    inspection: createInspection(
      asset,
      "saved-cloudinary",
      timeAt(referenceSeconds - 60),
    ),
    derivative: {
      source: { assetId: sourceId, publicId: sourcePublicId, version: 42 },
      recipe,
      ...fixtureRecipes[recipe],
      derivedAssetId: "cccccccccccccccccccccccccccccccc",
      format: "webp",
      bytes: 100_000,
      sha256: "a".repeat(64),
      verifiedAt: timeAt(referenceSeconds - 60),
    },
    status: "approved",
    review: {
      runId,
      assetId: sourceId,
      version: 42,
      recipe,
      derivativeSha256: "a".repeat(64),
      checks: { composition: true, content: true, rights: true },
      reviewedAt: timeAt(referenceSeconds - 30),
    },
    createdAt: timeAt(referenceSeconds - 60),
    expiresAt: referenceSeconds + 3_600,
    releasedAt: null,
  });
}

function changeReview(
  run: ExecutionRun,
  changes: Partial<HumanReview>,
): ExecutionRun {
  if (run.review === null) throw new Error("The fixture must have a review.");
  return { ...run, review: { ...run.review, ...changes } };
}

function uncheck(
  run: ExecutionRun,
  check: keyof HumanReview["checks"],
): ExecutionRun {
  if (run.review === null) throw new Error("The fixture must have a review.");
  return changeReview(run, {
    checks: { ...run.review.checks, [check]: false },
  });
}

type FixtureChange = (run: ExecutionRun) => unknown;

const fixtureChanges: Record<BenchmarkScenario, FixtureChange> = {
  valid_storefront: (run) => run,
  valid_social: () => createApprovedFixture("social"),
  valid_catalog: () => createApprovedFixture("catalog"),
  pending_review: (run) => ({ ...run, status: "review", review: null }),
  rejected_review: (run) => ({ ...run, status: "rejected" }),
  missing_review: (run) => ({ ...run, review: null }),
  composition_unchecked: (run) => uncheck(run, "composition"),
  content_unchecked: (run) => uncheck(run, "content"),
  rights_unchecked: (run) => uncheck(run, "rights"),
  inspection_asset_mismatch: (run) => ({
    ...run,
    inspection: {
      ...run.inspection,
      source: { ...run.inspection.source, assetId: otherSourceId },
    },
  }),
  inspection_version_mismatch: (run) => ({
    ...run,
    inspection: {
      ...run.inspection,
      source: { ...run.inspection.source, version: 43 },
    },
  }),
  derivative_asset_mismatch: (run) => ({
    ...run,
    derivative: {
      ...run.derivative,
      source: { ...run.derivative.source, assetId: otherSourceId },
    },
  }),
  derivative_version_mismatch: (run) => ({
    ...run,
    derivative: {
      ...run.derivative,
      source: { ...run.derivative.source, version: 43 },
    },
  }),
  derivative_public_id_mismatch: (run) => ({
    ...run,
    derivative: {
      ...run.derivative,
      source: {
        ...run.derivative.source,
        publicId: `media-pipeline/originals/${otherRunId}`,
      },
    },
  }),
  inspection_width_mismatch: (run) => ({
    ...run,
    inspection: { ...run.inspection, width: run.asset.width + 1 },
  }),
  inspection_bytes_mismatch: (run) => ({
    ...run,
    inspection: { ...run.inspection, bytes: run.asset.bytes + 1 },
  }),
  derivative_recipe_mismatch: (run) => ({
    ...run,
    derivative: { ...run.derivative, recipe: "social" },
  }),
  derivative_transform_mismatch: (run) => ({
    ...run,
    derivative: { ...run.derivative, transformation: "c_fill,w_50,h_50" },
  }),
  derivative_width_mismatch: (run) => ({
    ...run,
    derivative: { ...run.derivative, width: 1_201 },
  }),
  derivative_height_mismatch: (run) => ({
    ...run,
    derivative: { ...run.derivative, height: 1_201 },
  }),
  approval_run_mismatch: (run) => changeReview(run, { runId: otherRunId }),
  approval_asset_mismatch: (run) =>
    changeReview(run, { assetId: otherSourceId }),
  approval_version_mismatch: (run) => changeReview(run, { version: 43 }),
  approval_recipe_mismatch: (run) => changeReview(run, { recipe: "social" }),
  approval_hash_mismatch: (run) =>
    changeReview(run, { derivativeSha256: "b".repeat(64) }),
  expired_run: (run) => ({ ...run, expiresAt: referenceSeconds }),
  future_run: (run) => ({
    ...run,
    createdAt: timeAt(referenceSeconds + 10),
  }),
  future_approval: (run) =>
    changeReview(run, { reviewedAt: timeAt(referenceSeconds + 10) }),
  missing_derivative: (run) => ({ ...run, derivative: undefined }),
  unknown_field: (run) => ({
    ...run,
    callbackUrl: "https://example.test/unapproved-tool",
  }),
};

export function summarizeBenchmarkResults(
  results: ReadonlyArray<BenchmarkCaseResult>,
) {
  const passed = results.filter((item) => item.passed).length;
  return {
    passed,
    failed: results.length - passed,
    falseReleaseCount: results.filter(
      (item) => !item.expectedAllowed && item.actualAllowed,
    ).length,
    falseBlockCount: results.filter(
      (item) => item.expectedAllowed && !item.actualAllowed,
    ).length,
    accuracy: results.length === 0 ? 0 : (passed / results.length) * 100,
  };
}

/** Runs only pure contract checks. It never calls Cloudinary or an AI provider. */
export function runBenchmark(): BenchmarkResult {
  const results = benchmarkDataset.cases.map((testCase) => {
    const input = fixtureChanges[testCase.scenario](
      createApprovedFixture("storefront"),
    );
    const actual = evaluateRelease(input, referenceSeconds);
    return {
      ...testCase,
      actualAllowed: actual.allowed,
      actualCode: actual.code,
      reason: actual.reason,
      passed:
        actual.allowed === testCase.expectedAllowed &&
        actual.code === testCase.expectedCode,
    };
  });

  return benchmarkResultSchema.parse({
    version: benchmarkDataset.version,
    generatedAt: new Date().toISOString(),
    referenceTime: benchmarkDataset.referenceTime,
    method: "deterministic-release-contract-checks",
    limitation: benchmarkDataset.description,
    caseCount: 30,
    ...summarizeBenchmarkResults(results),
    results,
  });
}
