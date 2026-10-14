import { z } from "zod";

import { pipelineRequestSchema } from "@/lib/pipeline/contracts";

export const MAX_INGESTION_BYTES = 4_000_000;
export const MAX_IMAGE_SIDE = 20_000;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const INGESTION_TAG = "media-pipeline";
export const ORIGINALS_PUBLIC_ID_PREFIX = "media-pipeline/originals/";

export const ingestionMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export type IngestionMimeType = z.infer<typeof ingestionMimeTypeSchema>;

export const ingestionAssetIdSchema = z
  .string()
  .regex(/^[a-f0-9]{32}$/, "Use a valid Cloudinary asset ID.");

const originalPublicIdSchema = z
  .string()
  .regex(
    /^media-pipeline\/originals\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  );

const imageBytesSchema = z.number().int().min(1).max(MAX_INGESTION_BYTES);
const imageSideSchema = z.number().int().min(1).max(MAX_IMAGE_SIDE);
const epochSecondsSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

export const ingestionSignInputSchema = pipelineRequestSchema
  .extend({
    filename: z
      .string()
      .min(1)
      .max(160)
      .refine((value) => value.trim().length > 0)
      .regex(/^[^/\\\u0000-\u001f\u007f]+$/),
    mimeType: ingestionMimeTypeSchema,
    bytes: imageBytesSchema,
  })
  .strict();
export type IngestionSignInput = z.infer<typeof ingestionSignInputSchema>;

export const ingestionFinalizeInputSchema = z
  .object({
    assetId: ingestionAssetIdSchema,
    ticket: z
      .string()
      .max(4_096)
      .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/),
  })
  .strict();
export type IngestionFinalizeInput = z.infer<
  typeof ingestionFinalizeInputSchema
>;

export const ingestionIntentSchema = z
  .object({
    id: z.uuid(),
    sessionId: z.uuid(),
    publicId: originalPublicIdSchema,
    recipe: pipelineRequestSchema.shape.recipe,
    prompt: pipelineRequestSchema.shape.prompt,
    mimeType: ingestionMimeTypeSchema,
    bytes: imageBytesSchema,
    issuedAt: epochSecondsSchema,
    expiresAt: epochSecondsSchema,
  })
  .strict()
  .refine(
    (intent) => intent.publicId === `${ORIGINALS_PUBLIC_ID_PREFIX}${intent.id}`,
    "The upload identity does not match its namespace.",
  )
  .refine(
    (intent) => intent.expiresAt > intent.issuedAt,
    "The upload expiry must follow its issue time.",
  );
export type IngestionIntent = z.infer<typeof ingestionIntentSchema>;

export const verifiedAssetSchema = z
  .object({
    assetId: ingestionAssetIdSchema,
    publicId: originalPublicIdSchema,
    version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    width: imageSideSchema,
    height: imageSideSchema,
    bytes: imageBytesSchema,
    format: z.enum(["jpg", "png", "webp"]),
    resourceType: z.literal("image"),
    deliveryType: z.literal("authenticated"),
    verifiedAt: z.iso.datetime(),
    recipe: pipelineRequestSchema.shape.recipe,
    prompt: pipelineRequestSchema.shape.prompt,
    status: z.literal("verified"),
    executionComplete: z.literal(false),
  })
  .strict()
  .refine(
    (asset) => asset.width * asset.height <= MAX_IMAGE_PIXELS,
    "The image exceeds the decoded pixel limit.",
  );
export type VerifiedAsset = z.infer<typeof verifiedAssetSchema>;
