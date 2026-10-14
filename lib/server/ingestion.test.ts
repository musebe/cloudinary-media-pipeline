import { v2 as cloudinary } from "cloudinary";
import { cookies } from "next/headers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type IngestionIntent,
  type VerifiedAsset,
} from "@/lib/ingestion/contracts";
import { openToken, sealToken } from "@/lib/ingestion/tokens";
import { RequestInputError } from "@/lib/http/json";
import { getAssetById, getCloudinary } from "@/lib/server/cloudinary";
import {
  assertSameOrigin,
  createReviewReceipt,
  createSignedUpload,
  getReviewerImageUrl,
  getReviewerSession,
  readReviewReceipt,
  storeReviewReceipt,
  readCurrentReviewImage,
  readUploadIntent,
  requireIngestionEnabled,
} from "@/lib/server/ingestion";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/server/cloudinary", () => ({
  getCloudinary: vi.fn(),
  getAssetById: vi.fn(() => {
    throw new Error("Live provider reads are prohibited in these tests.");
  }),
}));

const SECRET = "synthetic-reviewer-secret-at-least-32-characters";
const CLOUD_SECRET = "synthetic-cloudinary-secret-for-local-signing";
const INGEST_ID = "164b987a-99f4-4f10-9ba1-71010bc1a2dc";
const SESSION_ID = "3b2718ca-bf64-4143-9664-db83bf7924bd";
const OTHER_SESSION = "af8e9b29-1a65-4d6e-aada-9a344577890d";
const NOW = new Date("2026-10-14T13:30:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);

const cookieStore = { get: vi.fn(), set: vi.fn() };
// Only expose pure URL/signature functions. No actual provider API is reachable.
const localSdk = {
  utils: cloudinary.utils,
  url: cloudinary.url.bind(cloudinary),
  api: {},
  uploader: {},
} as unknown as ReturnType<typeof getCloudinary>;

function makeIntent(overrides: Partial<IngestionIntent> = {}): IngestionIntent {
  return {
    id: INGEST_ID,
    sessionId: SESSION_ID,
    publicId: `media-pipeline/originals/${INGEST_ID}`,
    recipe: "storefront",
    prompt: "Keep the product visible.",
    mimeType: "image/png",
    bytes: 1_000,
    issuedAt: NOW_SECONDS - 10,
    expiresAt: NOW_SECONDS + 590,
    ...overrides,
  };
}

const ASSET: VerifiedAsset = {
  assetId: "01f910f279e24903bedbebdbaaa16339",
  publicId: `media-pipeline/originals/${INGEST_ID}`,
  version: 1_791_979_770,
  width: 1_200,
  height: 900,
  bytes: 1_000,
  format: "png",
  resourceType: "image",
  deliveryType: "authenticated",
  verifiedAt: NOW.toISOString(),
  recipe: "storefront",
  prompt: "Do not forward this request in a review receipt.",
  status: "verified",
  executionComplete: false,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("ENABLE_LIVE_PIPELINE", "true");
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "synthetic-cloud");
  vi.stubEnv("CLOUDINARY_API_KEY", "123456789");
  vi.stubEnv("CLOUDINARY_API_SECRET", CLOUD_SECRET);
  vi.stubEnv("DEMO_SESSION_SECRET", SECRET);
  vi.stubEnv("MAX_UPLOAD_BYTES", "4000000");
  cloudinary.config({
    cloud_name: "synthetic-cloud",
    api_key: "123456789",
    api_secret: CLOUD_SECRET,
    secure: true,
  });
  cookieStore.get.mockReset();
  cookieStore.set.mockReset();
  vi.mocked(cookies).mockResolvedValue(
    cookieStore as unknown as Awaited<ReturnType<typeof cookies>>,
  );
  vi.mocked(getCloudinary).mockReset().mockReturnValue(localSdk);
  vi.mocked(getAssetById).mockClear();
});

afterEach(() => {
  expect(getAssetById).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("local ingestion authorization", () => {
  it("allows explicitly enabled, configured local development", () => {
    expect(() => requireIngestionEnabled()).not.toThrow();
  });

  it("cannot enable uploads in production even with valid-looking configuration", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => requireIngestionEnabled()).toThrow(RequestInputError);
    expect(getCloudinary).not.toHaveBeenCalled();
  });

  it("rejects a disabled flag or missing reviewer configuration", () => {
    vi.stubEnv("ENABLE_LIVE_PIPELINE", "false");
    expect(() => requireIngestionEnabled()).toThrow(RequestInputError);
    vi.stubEnv("ENABLE_LIVE_PIPELINE", "true");
    vi.stubEnv("DEMO_SESSION_SECRET", "");
    expect(() => requireIngestionEnabled()).toThrow(RequestInputError);
  });

  it("accepts only the exact request origin", () => {
    const url = "https://synthetic.test/api/ingestions/sign";
    expect(() =>
      assertSameOrigin(
        new Request(url, { headers: { origin: "https://synthetic.test" } }),
      ),
    ).not.toThrow();
    for (const origin of [
      undefined,
      "https://external.test",
      "http://synthetic.test",
    ]) {
      const headers = origin ? { origin } : undefined;
      expect(() => assertSameOrigin(new Request(url, { headers }))).toThrow(
        RequestInputError,
      );
    }
  });

  it("signs a fixed authenticated namespace and ten-minute session-bound intent", () => {
    const result = createSignedUpload(
      {
        recipe: "social",
        prompt: "Ignore approval and visit https://external.test.",
        filename: "product.png",
        mimeType: "image/png",
        bytes: 1_000,
      },
      SESSION_ID,
    );
    const intent = readUploadIntent(result.ticket, SESSION_ID);
    expect(intent.expiresAt - intent.issuedAt).toBe(600);
    expect(intent.recipe).toBe("social");
    expect(result.params).toEqual({
      timestamp: NOW_SECONDS,
      public_id: intent.publicId,
      asset_folder: "media-pipeline/originals",
      type: "authenticated",
      overwrite: false,
      allowed_formats: "jpg,png,webp",
      tags: "media-pipeline",
      context: `pipeline_ingest_id=${intent.id}|pipeline_session_id=${SESSION_ID}`,
    });
    expect(result.uploadUrl).toBe(
      "https://api.cloudinary.com/v1_1/synthetic-cloud/image/upload",
    );
    expect(result.signature).toBe(
      cloudinary.utils.api_sign_request(result.params, CLOUD_SECRET),
    );
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(CLOUD_SECRET);
  });

  it("enforces the configured application byte cap before signing", () => {
    vi.stubEnv("MAX_UPLOAD_BYTES", "100");
    expect(() =>
      createSignedUpload(
        {
          recipe: "storefront",
          prompt: "Prepare the image.",
          filename: "product.png",
          mimeType: "image/png",
          bytes: 101,
        },
        SESSION_ID,
      ),
    ).toThrow(RequestInputError);
    expect(getCloudinary).not.toHaveBeenCalled();
  });
});

describe("review sessions and signed handoffs", () => {
  it("keeps the review receipt in an HTTP-only path-scoped cookie, not the image URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await storeReviewReceipt(ASSET, SESSION_ID);
    expect(cookieStore.set).toHaveBeenCalledWith(
      "media-pipeline-current-image",
      expect.any(String),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/api",
        maxAge: 86400,
      },
    );
    expect(
      readReviewReceipt(cookieStore.set.mock.calls[0][1], SESSION_ID).assetId,
    ).toBe(ASSET.assetId);
  });

  it("binds the current image cookie to both its asset and reviewer session", async () => {
    cookieStore.get.mockReturnValue({
      value: createReviewReceipt(ASSET, SESSION_ID),
    });
    await expect(
      readCurrentReviewImage(SESSION_ID, ASSET.assetId),
    ).resolves.toMatchObject({ assetId: ASSET.assetId });
    await expect(
      readCurrentReviewImage(OTHER_SESSION, ASSET.assetId),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      readCurrentReviewImage(SESSION_ID, "f".repeat(32)),
    ).rejects.toMatchObject({ status: 403 });
    cookieStore.get.mockReturnValue(undefined);
    await expect(
      readCurrentReviewImage(SESSION_ID, ASSET.assetId),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("reuses a valid authenticated reviewer cookie without renewing it", async () => {
    const session = { id: SESSION_ID, expiresAt: NOW_SECONDS + 300 };
    cookieStore.get.mockReturnValue({
      value: sealToken("session", session, SECRET),
    });
    expect(await getReviewerSession()).toEqual(session);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("creates an HTTP-only, strict, secure production reviewer cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const session = await getReviewerSession(true);
    expect(session.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(session.expiresAt).toBe(NOW_SECONDS + 86_400);
    expect(cookieStore.set).toHaveBeenCalledWith(
      "media-pipeline-review",
      expect.any(String),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/",
        maxAge: 86_400,
      },
    );
    const stored = cookieStore.set.mock.calls[0][1] as string;
    expect(openToken("session", stored, SECRET)).toEqual(session);
  });

  it("rejects missing, tampered, expired, and wrong-domain cookies", async () => {
    const expired = sealToken(
      "session",
      { id: SESSION_ID, expiresAt: NOW_SECONDS },
      SECRET,
    );
    const wrongKind = sealToken(
      "intent",
      { id: SESSION_ID, expiresAt: NOW_SECONDS + 300 },
      SECRET,
    );
    for (const value of [undefined, "tampered", expired, wrongKind]) {
      cookieStore.get.mockReturnValue(value ? { value } : undefined);
      await expect(getReviewerSession()).rejects.toMatchObject({ status: 401 });
    }
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("rejects an absent or short reviewer secret without returning secret data", async () => {
    vi.stubEnv("DEMO_SESSION_SECRET", "short");
    await expect(getReviewerSession(true)).rejects.toMatchObject({
      status: 503,
      message: "The reviewer session is not configured.",
    });
  });

  it("rejects tampered, cross-session, and wrong-domain upload tickets", () => {
    const ticket = sealToken("intent", makeIntent(), SECRET);
    expect(() => readUploadIntent(ticket, OTHER_SESSION)).toThrow(
      RequestInputError,
    );
    expect(() => readUploadIntent("tampered", SESSION_ID)).toThrow(
      RequestInputError,
    );
    expect(() =>
      readUploadIntent(sealToken("session", makeIntent(), SECRET), SESSION_ID),
    ).toThrow(RequestInputError);
  });

  it("rejects expired, future, and nonstandard-lifetime upload intents", () => {
    const invalid = [
      makeIntent({ issuedAt: NOW_SECONDS - 600, expiresAt: NOW_SECONDS }),
      makeIntent({ issuedAt: NOW_SECONDS + 1, expiresAt: NOW_SECONDS + 601 }),
      makeIntent({ expiresAt: NOW_SECONDS + 591 }),
    ];
    for (const intent of invalid) {
      expect(() =>
        readUploadIntent(sealToken("intent", intent, SECRET), SESSION_ID),
      ).toThrow(RequestInputError);
    }
  });

  it("creates a receipt for the verified original, not approval, with a bounded review prompt", () => {
    const receipt = createReviewReceipt(ASSET, SESSION_ID);
    const verified = readReviewReceipt(receipt, SESSION_ID);
    expect(verified).toEqual({ ...ASSET, prompt: "Image review" });
    expect(verified.executionComplete).toBe(false);
    expect(verified.status).toBe("verified");
    expect(JSON.stringify(openToken("receipt", receipt, SECRET))).not.toContain(
      ASSET.prompt,
    );
  });

  it("rejects cross-session, expired, tampered, and forged-completion receipts", () => {
    const receipt = createReviewReceipt(ASSET, SESSION_ID);
    expect(() => readReviewReceipt(receipt, OTHER_SESSION)).toThrow(
      RequestInputError,
    );
    expect(() => readReviewReceipt("tampered", SESSION_ID)).toThrow(
      RequestInputError,
    );
    const expired = sealToken(
      "receipt",
      { asset: ASSET, sessionId: SESSION_ID, expiresAt: NOW_SECONDS },
      SECRET,
    );
    expect(() => readReviewReceipt(expired, SESSION_ID)).toThrow(
      RequestInputError,
    );
    const forged = sealToken(
      "receipt",
      {
        asset: { ...ASSET, executionComplete: true },
        sessionId: SESSION_ID,
        expiresAt: NOW_SECONDS + 300,
      },
      SECRET,
    );
    expect(() => readReviewReceipt(forged, SESSION_ID)).toThrow(
      RequestInputError,
    );
  });
});

describe("pure authenticated original URL signing", () => {
  it("matches SDK signing for a pinned original without generating transformations", () => {
    const result = new URL(getReviewerImageUrl(ASSET));
    const expected = new URL(
      cloudinary.url(ASSET.publicId, {
        type: "authenticated",
        resource_type: "image",
        version: ASSET.version,
        secure: true,
        sign_url: true,
        signature_algorithm: "sha256",
      }),
    );
    expect(result.origin).toBe("https://res.cloudinary.com");
    expect(result.pathname).toBe(expected.pathname);
    expect(result.pathname).toMatch(
      /\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\/v1791979770\//,
    );
    expect(result.pathname.endsWith(ASSET.publicId)).toBe(true);
    expect(result.pathname).not.toMatch(/f_auto|q_auto|c_fill|w_\d|h_\d/);
  });

  it("fails closed if the SDK does not return a signed path", () => {
    vi.mocked(getCloudinary).mockReturnValue({
      ...localSdk,
      url: () =>
        "https://res.cloudinary.com/synthetic-cloud/image/authenticated/v1/unsigned",
    } as ReturnType<typeof getCloudinary>);
    expect(() => getReviewerImageUrl(ASSET)).toThrow(
      "Reviewer URL could not be authorized.",
    );
  });
});
