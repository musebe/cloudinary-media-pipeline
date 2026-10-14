import { z } from "zod";

import {
  INGESTION_TAG,
  ingestionAssetIdSchema,
  ingestionIntentSchema,
  MAX_IMAGE_PIXELS,
  MAX_IMAGE_SIDE,
  MAX_INGESTION_BYTES,
  verifiedAssetSchema,
  type IngestionIntent,
  type IngestionMimeType,
  type VerifiedAsset,
} from "@/lib/ingestion/contracts";

const expectedFormats: Record<IngestionMimeType, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Cloudinary returns additional fields. Parse only the evidence needed here;
// never forward provider URLs, credentials, session context, or other metadata.
const adminAssetSchema = z.object({
  asset_id: ingestionAssetIdSchema,
  public_id: z.string().min(1),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  resource_type: z.literal("image"),
  type: z.literal("authenticated"),
  format: z.enum(["jpg", "png", "webp"]),
  bytes: z.number().int().min(1).max(MAX_INGESTION_BYTES),
  width: z.number().int().min(1).max(MAX_IMAGE_SIDE),
  height: z.number().int().min(1).max(MAX_IMAGE_SIDE),
  tags: z.array(z.string()).max(100),
  context: z.object({
    custom: z.object({
      pipeline_ingest_id: z.uuid(),
      pipeline_session_id: z.uuid(),
    }),
  }),
});

export class IngestionValidationError extends Error {
  constructor() {
    super("The uploaded image could not be verified.");
    this.name = "IngestionValidationError";
  }
}

/**
 * Accept only Admin API evidence tied to this signed, unexpired upload intent.
 * This verifies ingestion, not inspection, approval, or permission to deliver.
 */
export function verifyUploadedAsset(
  response: unknown,
  intent: IngestionIntent,
  requestedAssetId: string,
  now = new Date(),
): VerifiedAsset {
  const parsedAsset = adminAssetSchema.safeParse(response);
  const parsedIntent = ingestionIntentSchema.safeParse(intent);
  const parsedAssetId = ingestionAssetIdSchema.safeParse(requestedAssetId);
  const nowSeconds = Math.floor(now.getTime() / 1_000);

  if (
    !parsedAsset.success ||
    !parsedIntent.success ||
    !parsedAssetId.success ||
    !Number.isFinite(nowSeconds)
  ) {
    throw new IngestionValidationError();
  }

  const asset = parsedAsset.data;
  const signedIntent = parsedIntent.data;

  if (
    nowSeconds < signedIntent.issuedAt ||
    nowSeconds >= signedIntent.expiresAt ||
    asset.asset_id !== parsedAssetId.data ||
    asset.public_id !== signedIntent.publicId ||
    asset.format !== expectedFormats[signedIntent.mimeType] ||
    asset.bytes !== signedIntent.bytes ||
    asset.width * asset.height > MAX_IMAGE_PIXELS ||
    asset.context.custom.pipeline_ingest_id !== signedIntent.id ||
    asset.context.custom.pipeline_session_id !== signedIntent.sessionId ||
    !asset.tags.includes(INGESTION_TAG)
  ) {
    throw new IngestionValidationError();
  }

  return verifiedAssetSchema.parse({
    assetId: asset.asset_id,
    publicId: asset.public_id,
    version: asset.version,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    format: asset.format,
    resourceType: asset.resource_type,
    deliveryType: asset.type,
    verifiedAt: now.toISOString(),
    recipe: signedIntent.recipe,
    prompt: signedIntent.prompt,
    status: "verified",
    executionComplete: false,
  });
}
