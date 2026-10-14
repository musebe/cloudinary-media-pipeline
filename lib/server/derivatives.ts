import "server-only";

import { createHash } from "node:crypto";
import { getCldImageUrl } from "next-cloudinary";
import sharp from "sharp";
import { z } from "zod";
import { getCloudinary, getAssetById } from "@/lib/server/cloudinary";
import { RequestInputError } from "@/lib/http/json";
import {
  derivativeSchema,
  getRecipeTransformation,
  type VerifiedDerivative,
} from "@/lib/execution/contracts";
import {
  MAX_INGESTION_BYTES,
  type VerifiedAsset,
} from "@/lib/ingestion/contracts";
import { recipeMetadata, type PipelineRecipe } from "@/lib/pipeline/contracts";

const sourceReadbackSchema = z.object({
  asset_id: z.string(),
  public_id: z.string(),
  version: z.number().int(),
  resource_type: z.literal("image"),
  type: z.literal("authenticated"),
  format: z.enum(["jpg", "png", "webp"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  tags: z.array(z.string()),
  context: z.object({ custom: z.object({ pipeline_session_id: z.uuid() }) }),
});

/** Refresh provenance before any upload-specific processing; no client URL is read. */
export function assertCurrentSource(
  input: unknown,
  asset: VerifiedAsset,
  sessionId: string,
) {
  const current = sourceReadbackSchema.safeParse(input);
  if (!current.success)
    throw new RequestInputError(
      "The source image could not be reverified.",
      409,
    );
  const source = current.data;
  if (
    source.asset_id !== asset.assetId ||
    source.public_id !== asset.publicId ||
    source.version !== asset.version ||
    source.width !== asset.width ||
    source.height !== asset.height ||
    source.bytes !== asset.bytes ||
    source.format !== asset.format ||
    !source.tags.includes("media-pipeline") ||
    source.context.custom.pipeline_session_id !== sessionId
  )
    throw new RequestInputError(
      "The source image changed or belongs to another session.",
      409,
    );
}

/** Build precisely the pre-generated path. Auto format/quality would create another artifact. */
export function getDerivativeUrl(asset: VerifiedAsset, recipe: PipelineRecipe) {
  const transformation = getRecipeTransformation(recipe);
  const base = new URL(
    getCldImageUrl(
      {
        src: asset.publicId,
        version: asset.version,
        deliveryType: "authenticated",
        rawTransformations: [transformation],
        format: "default",
        quality: "default",
      },
      { cloud: { cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME! } },
    ),
  );
  // An explicit format extension, not f_auto, identifies the verified WebP bytes.
  base.pathname += ".webp";
  const signed = new URL(
    getCloudinary().url(asset.publicId, {
      type: "authenticated",
      resource_type: "image",
      version: asset.version,
      raw_transformation: transformation,
      format: "webp",
      secure: true,
      sign_url: true,
      signature_algorithm: "sha256",
    }),
  );
  const signature = signed.pathname.match(/\/s--[A-Za-z0-9_-]{8}--\//)?.[0];
  if (!signature) throw new Error("The derivative could not be authorized.");
  base.pathname = base.pathname.replace(
    "/image/authenticated/",
    "/image/authenticated" + signature,
  );
  if (base.pathname !== signed.pathname)
    throw new Error("The derivative path differs from its authorization.");
  return base.toString();
}

export async function downloadVerifiedBytes(url: string) {
  const expectedCloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  const target = new URL(url);
  if (
    target.origin !== "https://res.cloudinary.com" ||
    target.username ||
    target.password ||
    !target.pathname.startsWith(`/${expectedCloud}/image/authenticated/`)
  ) {
    throw new Error("The delivery origin is not allowed.");
  }
  const response = await fetch(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (
    !response.ok ||
    response.headers.get("x-cld-error") ||
    response.headers.get("content-type")?.split(";")[0] !== "image/webp"
  ) {
    throw new Error("The derivative was not delivered as WebP.");
  }
  if (
    Number(response.headers.get("content-length") ?? 0) > MAX_INGESTION_BYTES
  ) {
    await response.body?.cancel();
    throw new Error("The derivative exceeds its delivery limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The delivery response is empty.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_INGESTION_BYTES) {
        await reader.cancel();
        throw new Error("The derivative exceeds its delivery limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!length) throw new Error("The delivery response is empty.");
  return Buffer.concat(chunks, length);
}

export async function inspectDerivativeBytes(
  bytes: Buffer,
  recipe: PipelineRecipe,
) {
  if (bytes.length === 0 || bytes.length > MAX_INGESTION_BYTES)
    throw new Error("Invalid derivative size.");
  const output = recipeMetadata.find((item) => item.id === recipe)!;
  const image = sharp(bytes, {
    limitInputPixels: 4_000_000,
    failOn: "warning",
  });
  const metadata = await image.metadata();
  if (
    metadata.format !== "webp" ||
    metadata.width !== output.width ||
    metadata.height !== output.height ||
    (metadata.pages ?? 1) !== 1
  ) {
    throw new Error(
      "The decoded derivative does not match the selected recipe.",
    );
  }
  // Decode all pixels, not just the header, before recording delivery evidence.
  await image.raw().toBuffer();
  return {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

const eagerResponseSchema = z.object({
  asset_id: z.string(),
  public_id: z.string(),
  version: z.number().int(),
  resource_type: z.literal("image"),
  type: z.literal("authenticated"),
  eager: z
    .array(
      z.object({
        transformation: z.string(),
        width: z.number(),
        height: z.number(),
        format: z.literal("webp"),
        bytes: z.number().int().positive(),
      }),
    )
    .length(1),
});
const derivedReadbackSchema = z.object({
  asset_id: z.string(),
  public_id: z.string(),
  version: z.number().int(),
  resource_type: z.literal("image"),
  type: z.literal("authenticated"),
  derived: z
    .array(
      z.object({
        id: z.string().regex(/^[a-f0-9]{32}$/),
        transformation: z.string(),
        format: z.string(),
        bytes: z.number().int().positive(),
      }),
    )
    .max(100),
});

/** One fixed standard eager transformation, two Admin reads, one bounded delivery verification. */
export async function prepareUploadedDerivative(
  asset: VerifiedAsset,
  recipe: PipelineRecipe,
  sessionId: string,
): Promise<VerifiedDerivative> {
  assertCurrentSource(await getAssetById(asset.assetId), asset, sessionId);
  const transformation = getRecipeTransformation(recipe);
  const response: unknown = await getCloudinary().uploader.explicit(
    asset.publicId,
    {
      type: "authenticated",
      resource_type: "image",
      eager: `${transformation}/webp`,
      eager_async: false,
      timeout: 20_000,
    },
  );
  const eager = eagerResponseSchema.parse(response);
  const output = recipeMetadata.find((item) => item.id === recipe)!;
  const result = eager.eager[0];
  if (
    eager.asset_id !== asset.assetId ||
    eager.public_id !== asset.publicId ||
    eager.version !== asset.version ||
    ![transformation, `${transformation}/webp`].includes(
      result.transformation,
    ) ||
    result.width !== output.width ||
    result.height !== output.height
  ) {
    throw new Error(
      "The eager result does not match the verified source and recipe.",
    );
  }
  const readback = derivedReadbackSchema.parse(
    await getAssetById(asset.assetId),
  );
  if (
    readback.asset_id !== asset.assetId ||
    readback.public_id !== asset.publicId ||
    readback.version !== asset.version
  ) {
    throw new Error("The source changed during derivative creation.");
  }
  const derived = readback.derived.find(
    (item) =>
      item.format === "webp" &&
      [transformation, `${transformation}/webp`].includes(
        item.transformation,
      ) &&
      item.bytes === result.bytes,
  );
  if (!derived)
    throw new Error(
      "The generated derivative was not present in Admin API readback.",
    );
  const evidence = await inspectDerivativeBytes(
    await downloadVerifiedBytes(getDerivativeUrl(asset, recipe)),
    recipe,
  );
  if (evidence.bytes !== result.bytes)
    throw new Error("The delivered bytes differ from the generated artifact.");
  return derivativeSchema.parse({
    source: {
      assetId: asset.assetId,
      publicId: asset.publicId,
      version: asset.version,
    },
    recipe,
    transformation,
    derivedAssetId: derived.id,
    width: output.width,
    height: output.height,
    format: "webp",
    ...evidence,
    verifiedAt: new Date().toISOString(),
  });
}
