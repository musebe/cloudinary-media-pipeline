import { z } from "zod";
import { ingestionAssetIdSchema } from "@/lib/ingestion/contracts";
import { pipelineRequestSchema } from "@/lib/pipeline/contracts";
import {
  releaseDecisionSchema,
  reviewSchema,
  runSchema,
  derivativeSchema,
  sourceIdentitySchema,
} from "@/lib/execution/contracts";

export const executeInputSchema = z.discriminatedUnion("source", [
  pipelineRequestSchema.extend({ source: z.literal("demo") }).strict(),
  pipelineRequestSchema
    .extend({ source: z.literal("upload"), assetId: ingestionAssetIdSchema })
    .strict(),
]);
export const reviewInputSchema = z
  .object({
    runId: z.uuid(),
    decision: z.enum(["approve", "reject"]),
    checks: reviewSchema.shape.checks,
  })
  .strict();
export const runIdInputSchema = z.object({ runId: z.uuid() }).strict();
export const executionResponseSchema = z
  .object({
    run: runSchema,
    decision: releaseDecisionSchema,
    outputImageUrl: z
      .string()
      .regex(/^\/api\/pipelines\/output\?run=[a-f0-9-]{36}$/),
    noNewMediaOperations: z.boolean(),
  })
  .strict();
export type ExecutionResponse = z.infer<typeof executionResponseSchema>;
export const manifestSchema = z
  .object({
    schemaVersion: z.literal("media-pipeline.delivery.v1"),
    runId: z.uuid(),
    source: sourceIdentitySchema,
    derivative: derivativeSchema,
    approvedAt: z.iso.datetime(),
    releasedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    deliveryUrl: z
      .string()
      .regex(/^\/api\/pipelines\/output\?run=[a-f0-9-]{36}&download=1$/),
    authorization: z.literal("session-proxy"),
    evidenceOrigin: z.enum(["saved-cloudinary", "live-cloudinary"]),
    disclaimer: z.string().min(1),
  })
  .strict();
export type DeliveryManifest = z.infer<typeof manifestSchema>;
