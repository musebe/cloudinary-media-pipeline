import { z } from "zod";
import {
  ingestionSignInputSchema,
  verifiedAssetSchema,
  type IngestionSignInput,
} from "@/lib/ingestion/contracts";
import { validatePipelinePlan } from "@/lib/pipeline/planner";

const signedUploadSchema = z
  .object({
    uploadUrl: z
      .string()
      .regex(
        /^https:\/\/api\.cloudinary\.com\/v1_1\/[a-zA-Z0-9_-]+\/image\/upload$/,
      ),
    apiKey: z.string().min(1),
    signature: z.string().regex(/^[a-f0-9]{40,64}$/),
    params: z
      .object({
        timestamp: z.number().int(),
        public_id: z.string(),
        asset_folder: z.literal("media-pipeline/originals"),
        type: z.literal("authenticated"),
        overwrite: z.literal(false),
        allowed_formats: z.literal("jpg,png,webp"),
        tags: z.literal("media-pipeline"),
        context: z.string(),
      })
      .strict(),
    ticket: z.string().max(4096),
  })
  .strict();

async function readResponse(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      "The service returned an unexpected response. Please try again.",
    );
  const result: unknown = await response.json();
  if (!response.ok) {
    const failure = z.object({ error: z.string().max(250) }).safeParse(result);
    throw new Error(
      failure.success
        ? failure.data.error
        : "Image verification did not complete.",
    );
  }
  return result;
}

export async function validateSelectedImage(
  file: File,
  input: { recipe: IngestionSignInput["recipe"]; prompt: string },
  maxBytes: number,
) {
  const result = ingestionSignInputSchema.safeParse({
    ...input,
    filename: file.name,
    mimeType: file.type,
    bytes: file.size,
  });
  if (!result.success || file.size > maxBytes)
    throw new Error(
      "Choose a JPEG, PNG, or WebP within the displayed upload limit.",
    );
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
    (value, index) => bytes[index] === value,
  );
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!(
    (file.type === "image/jpeg" && jpeg) ||
    (file.type === "image/png" && png) ||
    (file.type === "image/webp" && webp)
  ))
    throw new Error("The file header does not match its image type.");
  return result.data;
}

export async function uploadAndVerify(
  file: File,
  input: IngestionSignInput,
  onStatus: (status: string) => void,
) {
  onStatus("Authorizing upload…");
  const authorization = signedUploadSchema.parse(
    await readResponse(
      await fetch("/api/ingestions/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(15000),
      }),
    ),
  );
  const body = new FormData();
  body.set("file", file);
  body.set("api_key", authorization.apiKey);
  body.set("signature", authorization.signature);
  for (const [key, value] of Object.entries(authorization.params))
    body.set(key, String(value));
  onStatus("Uploading to Cloudinary…");
  const uploaded = z
    .object({ asset_id: z.string().regex(/^[a-f0-9]{32}$/) })
    .parse(
      await readResponse(
        await fetch(authorization.uploadUrl, {
          method: "POST",
          body,
          signal: AbortSignal.timeout(60000),
        }),
      ),
    );
  onStatus("Reading the stored asset back…");
  const finalized = z
    .object({
      asset: verifiedAssetSchema,
      reviewImageUrl: z
        .string()
        .regex(/^\/api\/ingestions\/image\?asset=[a-f0-9]{32}$/),
      plan: z.unknown(),
    })
    .strict()
    .parse(
      await readResponse(
        await fetch("/api/ingestions/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId: uploaded.asset_id,
            ticket: authorization.ticket,
          }),
          signal: AbortSignal.timeout(20000),
        }),
      ),
    );
  return {
    asset: finalized.asset,
    imageUrl: finalized.reviewImageUrl,
    plan: validatePipelinePlan(finalized.plan),
  };
}
