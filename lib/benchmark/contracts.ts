import { z } from "zod";

import { releaseDecisionSchema } from "@/lib/execution/contracts";

export const benchmarkScenarioSchema = z.enum([
  "valid_storefront",
  "valid_social",
  "valid_catalog",
  "pending_review",
  "rejected_review",
  "missing_review",
  "composition_unchecked",
  "content_unchecked",
  "rights_unchecked",
  "inspection_asset_mismatch",
  "inspection_version_mismatch",
  "derivative_asset_mismatch",
  "derivative_version_mismatch",
  "derivative_public_id_mismatch",
  "inspection_width_mismatch",
  "inspection_bytes_mismatch",
  "derivative_recipe_mismatch",
  "derivative_transform_mismatch",
  "derivative_width_mismatch",
  "derivative_height_mismatch",
  "approval_run_mismatch",
  "approval_asset_mismatch",
  "approval_version_mismatch",
  "approval_recipe_mismatch",
  "approval_hash_mismatch",
  "expired_run",
  "future_run",
  "future_approval",
  "missing_derivative",
  "unknown_field",
]);
export type BenchmarkScenario = z.infer<typeof benchmarkScenarioSchema>;

const benchmarkCaseSchema = z
  .object({
    id: z.string().regex(/^RC-\d{2}$/),
    label: z.string().min(1).max(160),
    scenario: benchmarkScenarioSchema,
    expectedAllowed: z.boolean(),
    expectedCode: releaseDecisionSchema.shape.code,
  })
  .strict();

export const benchmarkDatasetSchema = z
  .object({
    version: z.literal("release-contracts-v1"),
    referenceTime: z.iso.datetime(),
    description: z.string().min(1).max(400),
    cases: z.array(benchmarkCaseSchema).length(30),
  })
  .strict()
  .refine(
    (dataset) => new Set(dataset.cases.map((item) => item.id)).size === 30,
    "Every benchmark case must have a unique ID.",
  )
  .refine(
    (dataset) =>
      new Set(dataset.cases.map((item) => item.scenario)).size === 30,
    "Every benchmark scenario must appear exactly once.",
  );

export const benchmarkCaseResultSchema = benchmarkCaseSchema
  .extend({
    actualAllowed: z.boolean(),
    actualCode: releaseDecisionSchema.shape.code,
    reason: releaseDecisionSchema.shape.reason,
    passed: z.boolean(),
  })
  .strict();
export type BenchmarkCaseResult = z.infer<typeof benchmarkCaseResultSchema>;

const caseCountSchema = z.number().int().min(0).max(30);

export const benchmarkResultSchema = z
  .object({
    version: z.literal("release-contracts-v1"),
    generatedAt: z.iso.datetime(),
    referenceTime: z.iso.datetime(),
    method: z.literal("deterministic-release-contract-checks"),
    limitation: z.string().min(1).max(400),
    caseCount: z.literal(30),
    passed: caseCountSchema,
    failed: caseCountSchema,
    falseReleaseCount: caseCountSchema,
    falseBlockCount: caseCountSchema,
    accuracy: z.number().finite().min(0).max(100),
    results: z.array(benchmarkCaseResultSchema).length(30),
  })
  .strict();
export type BenchmarkResult = z.infer<typeof benchmarkResultSchema>;
