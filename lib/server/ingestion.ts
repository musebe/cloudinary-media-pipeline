import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { getCldImageUrl } from "next-cloudinary";
import { getConfigurationStatus } from "@/lib/configuration";
import { RequestInputError } from "@/lib/http/json";
import { getCloudinary } from "@/lib/server/cloudinary";
import { sealToken, openToken } from "@/lib/ingestion/tokens";
import {
  ingestionIntentSchema,
  verifiedAssetSchema,
  type IngestionSignInput,
  type IngestionIntent,
  type VerifiedAsset,
} from "@/lib/ingestion/contracts";

const COOKIE_NAME = "media-pipeline-review";
const IMAGE_COOKIE_NAME = "media-pipeline-current-image";
const SESSION_SECONDS = 24 * 60 * 60;
const UPLOAD_SECONDS = 10 * 60;
const sessionSchema = z
  .object({ id: z.uuid(), expiresAt: z.number().int().positive() })
  .strict();
const receiptSchema = z
  .object({
    sessionId: z.uuid(),
    expiresAt: z.number().int().positive(),
    asset: verifiedAssetSchema,
  })
  .strict();

function sessionSecret() {
  const secret = process.env.DEMO_SESSION_SECRET?.trim();
  if (!secret || secret.length < 32)
    throw new RequestInputError("The reviewer session is not configured.", 503);
  return secret;
}

export function assertSameOrigin(request: Request) {
  const expected = new URL(request.url);
  const host = request.headers.get("host") ?? expected.host;
  const origin = request.headers.get("origin");
  let valid = false;
  try {
    const parsed = new URL(origin ?? "");
    valid =
      origin === parsed.origin &&
      parsed.host === host &&
      parsed.protocol === expected.protocol;
  } catch {
    /* Missing, opaque, and malformed origins are rejected. */
  }
  if (!valid) {
    throw new RequestInputError(
      "Use the application to submit this request.",
      403,
    );
  }
}

export function requireIngestionEnabled() {
  if (!getConfigurationStatus(process.env).capabilities.liveIngestion) {
    throw new RequestInputError(
      "Image uploads are disabled. Load the saved demo instead.",
      503,
    );
  }
}

export async function getReviewerSession(create = false) {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const secret = sessionSecret();
  if (token) {
    try {
      const session = sessionSchema.parse(openToken("session", token, secret));
      if (session.expiresAt > Math.floor(Date.now() / 1000)) return session;
    } catch {
      /* Invalid cookies do not grant access. */
    }
  }
  if (!create)
    throw new RequestInputError(
      "The review session has expired. Upload the image again.",
      401,
    );
  const session = {
    id: randomUUID(),
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  store.set(COOKIE_NAME, sealToken("session", session, secret), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return session;
}

export function createSignedUpload(
  input: IngestionSignInput,
  sessionId: string,
) {
  const maxBytes = getConfigurationStatus(process.env).maxUploadBytes;
  if (input.bytes > maxBytes)
    throw new RequestInputError(
      "The selected image exceeds the upload limit.",
      413,
    );
  const id = randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);
  const intent = ingestionIntentSchema.parse({
    id,
    sessionId,
    publicId: `media-pipeline/originals/${id}`,
    recipe: input.recipe,
    prompt: input.prompt,
    mimeType: input.mimeType,
    bytes: input.bytes,
    issuedAt: timestamp,
    expiresAt: timestamp + UPLOAD_SECONDS,
  });
  const params = {
    timestamp,
    public_id: intent.publicId,
    asset_folder: "media-pipeline/originals",
    type: "authenticated",
    overwrite: false,
    allowed_formats: "jpg,png,webp",
    tags: "media-pipeline",
    context: `pipeline_ingest_id=${id}|pipeline_session_id=${sessionId}`,
  };
  const cloudinary = getCloudinary();
  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!)}/image/upload`,
    apiKey: process.env.CLOUDINARY_API_KEY!,
    signature: cloudinary.utils.api_sign_request(
      params,
      process.env.CLOUDINARY_API_SECRET!,
    ),
    params,
    ticket: sealToken("intent", intent, sessionSecret()),
  };
}

export function readUploadIntent(
  ticket: string,
  sessionId: string,
): IngestionIntent {
  try {
    const intent = ingestionIntentSchema.parse(
      openToken("intent", ticket, sessionSecret()),
    );
    const now = Math.floor(Date.now() / 1000);
    if (
      intent.sessionId !== sessionId ||
      now < intent.issuedAt ||
      now >= intent.expiresAt ||
      intent.expiresAt - intent.issuedAt !== UPLOAD_SECONDS
    )
      throw new Error("invalid");
    return intent;
  } catch {
    throw new RequestInputError(
      "The upload authorization is invalid or expired.",
      403,
    );
  }
}

export function createReviewReceipt(asset: VerifiedAsset, sessionId: string) {
  return sealToken(
    "receipt",
    {
      asset: { ...asset, prompt: "Image review" },
      sessionId,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    },
    sessionSecret(),
  );
}

export async function storeReviewReceipt(
  asset: VerifiedAsset,
  sessionId: string,
) {
  (await cookies()).set(
    IMAGE_COOKIE_NAME,
    createReviewReceipt(asset, sessionId),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/api/ingestions/image",
      maxAge: SESSION_SECONDS,
    },
  );
}

export async function readCurrentReviewImage(
  sessionId: string,
  assetId: string,
) {
  const receipt = (await cookies()).get(IMAGE_COOKIE_NAME)?.value;
  if (!receipt)
    throw new RequestInputError(
      "No verified image is available in this session.",
      401,
    );
  const asset = readReviewReceipt(receipt, sessionId);
  if (asset.assetId !== assetId)
    throw new RequestInputError(
      "This image is not available to the current review session.",
      403,
    );
  return asset;
}

export function readReviewReceipt(receipt: string, sessionId: string) {
  try {
    const payload = receiptSchema.parse(
      openToken("receipt", receipt, sessionSecret()),
    );
    if (
      payload.sessionId !== sessionId ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    )
      throw new Error("invalid");
    return payload.asset;
  } catch {
    throw new RequestInputError(
      "This image is not available to the current review session.",
      403,
    );
  }
}

/** Sign the exact original only. This is reviewer access, not approval or release. */
export function getReviewerImageUrl(asset: VerifiedAsset) {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
  const base = new URL(
    getCldImageUrl(
      {
        src: asset.publicId,
        version: asset.version,
        deliveryType: "authenticated",
        format: "default",
        quality: "default",
      },
      { cloud: { cloudName } },
    ),
  );
  // next-cloudinary builds the path; the backend SDK supplies its authentication signature.
  // No resizing/auto-format parameters are added to an authenticated original.
  const signed = getCloudinary().url(asset.publicId, {
    type: "authenticated",
    resource_type: "image",
    version: asset.version,
    secure: true,
    sign_url: true,
    signature_algorithm: "sha256",
  });
  const signature = new URL(signed).pathname.match(
    /\/s--[A-Za-z0-9_-]{8}--\//,
  )?.[0];
  if (!signature) throw new Error("Reviewer URL could not be authorized.");
  base.pathname = base.pathname.replace(
    "/image/authenticated/",
    "/image/authenticated" + signature,
  );
  return base.toString();
}
