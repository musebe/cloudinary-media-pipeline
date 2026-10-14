import { z } from "zod";

import {
  MAX_INGESTION_BYTES,
  verifiedAssetSchema,
} from "@/lib/ingestion/contracts";
import {
  pipelineRecipeSchema,
  pipelineRequestSchema,
  recipeMetadata,
  type PipelineRecipe,
} from "@/lib/pipeline/contracts";

const positiveIntegerSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const sourceIdentitySchema = z
  .object({
    assetId: verifiedAssetSchema.shape.assetId,
    publicId: verifiedAssetSchema.shape.publicId,
    version: verifiedAssetSchema.shape.version,
  })
  .strict();
export type SourceIdentity = z.infer<typeof sourceIdentitySchema>;

export const derivativeSchema = z
  .object({
    source: sourceIdentitySchema,
    recipe: pipelineRecipeSchema,
    transformation: z.string().min(1).max(200),
    derivedAssetId: verifiedAssetSchema.shape.assetId,
    width: positiveIntegerSchema,
    height: positiveIntegerSchema,
    format: z.literal("webp"),
    bytes: positiveIntegerSchema.max(MAX_INGESTION_BYTES),
    sha256: sha256Schema,
    verifiedAt: z.iso.datetime(),
  })
  .strict();
export type VerifiedDerivative = z.infer<typeof derivativeSchema>;

export const inspectionSchema = z
  .object({
    source: sourceIdentitySchema,
    method: z.literal("asset-metadata"),
    evidenceOrigin: z.enum(["saved-cloudinary", "live-cloudinary"]),
    width: verifiedAssetSchema.shape.width,
    height: verifiedAssetSchema.shape.height,
    bytes: verifiedAssetSchema.shape.bytes,
    format: verifiedAssetSchema.shape.format,
    checkedAt: z.iso.datetime(),
    contentReviewRequired: z.literal(true),
  })
  .strict();
export type InspectionEvidence = z.infer<typeof inspectionSchema>;

export const reviewSchema = z
  .object({
    runId: z.uuid(),
    assetId: verifiedAssetSchema.shape.assetId,
    version: verifiedAssetSchema.shape.version,
    recipe: pipelineRecipeSchema,
    derivativeSha256: sha256Schema,
    checks: z
      .object({
        composition: z.boolean(),
        content: z.boolean(),
        rights: z.boolean(),
      })
      .strict(),
    reviewedAt: z.iso.datetime(),
  })
  .strict();
export type HumanReview = z.infer<typeof reviewSchema>;

export const runSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(["demo", "upload"]),
    recipe: pipelineRecipeSchema,
    prompt: pipelineRequestSchema.shape.prompt,
    asset: verifiedAssetSchema,
    inspection: inspectionSchema,
    derivative: derivativeSchema,
    status: z.enum(["review", "approved", "rejected", "released"]),
    review: reviewSchema.nullable(),
    createdAt: z.iso.datetime(),
    expiresAt: positiveIntegerSchema,
    releasedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type ExecutionRun = z.infer<typeof runSchema>;

export const releaseDecisionSchema = z
  .object({
    allowed: z.boolean(),
    code: z.enum([
      "invalid_run",
      "invalid_clock",
      "run_expired",
      "run_not_started",
      "source_mismatch",
      "inspection_mismatch",
      "derivative_mismatch",
      "review_required",
      "review_rejected",
      "review_mismatch",
      "review_incomplete",
      "review_time_invalid",
      "invalid_release_state",
      "release_allowed",
    ]),
    reason: z.string().min(1).max(300),
  })
  .strict()
  .refine(
    (decision) => decision.allowed === (decision.code === "release_allowed"),
    "A release can be allowed only by the successful policy decision.",
  );
export type ReleaseDecision = z.infer<typeof releaseDecisionSchema>;

/** The request text never contributes to executable transformation parameters. */
export function getRecipeTransformation(recipe: PipelineRecipe): string {
  const output = recipeMetadata.find((item) => item.id === recipe);
  if (!output) throw new Error("Select a supported output recipe.");

  const crop = output.fit === "pad" ? "b_white,c_pad" : "c_fill,g_center";
  return `${crop},h_${output.height},w_${output.width}/q_80`;
}
