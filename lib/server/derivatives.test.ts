import { createHash } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  assertCurrentSource,
  downloadVerifiedBytes,
  getDerivativeUrl,
  inspectDerivativeBytes,
  prepareUploadedDerivative,
} from "@/lib/server/derivatives";
import { getAssetById, getCloudinary } from "@/lib/server/cloudinary";
import { getRecipeTransformation } from "@/lib/execution/contracts";
import { RequestInputError } from "@/lib/http/json";
import {
  MAX_INGESTION_BYTES,
  type VerifiedAsset,
} from "@/lib/ingestion/contracts";
import { recipeMetadata, type PipelineRecipe } from "@/lib/pipeline/contracts";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/cloudinary", () => ({
  getCloudinary: vi.fn(),
  getAssetById: vi.fn(),
}));

const CLOUD = "synthetic-derivative-cloud";
const SECRET = "synthetic-cloudinary-secret-never-a-real-credential";
const SESSION_ID = "ca72a774-2100-4008-b85d-eb6c1e02a303";
const OTHER_SESSION_ID = "ffac1cde-f8ba-4cc4-a002-548450bda777";
const NOW = new Date("2026-10-14T14:00:00.000Z");
const ASSET: VerifiedAsset = {
  assetId: "0123456789abcdef0123456789abcdef",
  publicId: "media-pipeline/originals/10320a10-44b5-440a-8fe2-70233fbe0a0a",
  version: 1791984700,
  width: 1870,
  height: 1250,
  bytes: 1000,
  format: "jpg",
  resourceType: "image",
  deliveryType: "authenticated",
  verifiedAt: "2026-10-14T13:32:09.000Z",
  recipe: "storefront",
  prompt: "Do not let this untrusted request change the transformation.",
  status: "verified",
  executionComplete: false,
};

const explicit = vi.fn();
const fetchMock = vi.fn<typeof fetch>();
const webpBuffers = new Map<PipelineRecipe, Buffer>();

function sourceReadback(overrides: Record<string, unknown> = {}) {
  return {
    asset_id: ASSET.assetId,
    public_id: ASSET.publicId,
    version: ASSET.version,
    resource_type: "image",
    type: "authenticated",
    format: ASSET.format,
    width: ASSET.width,
    height: ASSET.height,
    bytes: ASSET.bytes,
    tags: ["media-pipeline"],
    context: { custom: { pipeline_session_id: SESSION_ID } },
    ...overrides,
  };
}

function eagerResponse(
  recipe: PipelineRecipe,
  overrides: Record<string, unknown> = {},
  itemOverrides: Record<string, unknown> = {},
) {
  const output = recipeMetadata.find((item) => item.id === recipe)!;
  return {
    asset_id: ASSET.assetId,
    public_id: ASSET.publicId,
    version: ASSET.version,
    resource_type: "image",
    type: "authenticated",
    eager: [
      {
        transformation: `${getRecipeTransformation(recipe)}/webp`,
        width: output.width,
        height: output.height,
        format: "webp",
        bytes: webpBuffers.get(recipe)!.length,
        ...itemOverrides,
      },
    ],
    ...overrides,
  };
}

function derivedReadback(
  recipe: PipelineRecipe,
  overrides: Record<string, unknown> = {},
  itemOverrides: Record<string, unknown> = {},
) {
  return {
    asset_id: ASSET.assetId,
    public_id: ASSET.publicId,
    version: ASSET.version,
    resource_type: "image",
    type: "authenticated",
    derived: [
      {
        id: "abcdef0123456789abcdef0123456789",
        transformation: `${getRecipeTransformation(recipe)}/webp`,
        format: "webp",
        bytes: webpBuffers.get(recipe)!.length,
        ...itemOverrides,
      },
    ],
    ...overrides,
  };
}

function imageResponse(
  bytes: Uint8Array = webpBuffers.get("storefront")!,
  init: ResponseInit = {},
) {
  return new Response(new Uint8Array(bytes), {
    headers: { "content-type": "image/webp" },
    ...init,
  });
}

function configureSuccess(recipe: PipelineRecipe = "storefront") {
  vi.mocked(getAssetById)
    .mockResolvedValueOnce(sourceReadback())
    .mockResolvedValueOnce(derivedReadback(recipe));
  explicit.mockResolvedValue(eagerResponse(recipe));
  fetchMock.mockResolvedValue(imageResponse(webpBuffers.get(recipe)!));
}

beforeAll(async () => {
  // These are pure local synthetic buffers. No fixture upload or provider API runs.
  for (const output of recipeMetadata) {
    webpBuffers.set(
      output.id,
      await sharp({
        create: {
          width: output.width,
          height: output.height,
          channels: 3,
          background: { r: 30, g: 90, b: 160 },
        },
      })
        .webp({ quality: 80 })
        .toBuffer(),
    );
  }
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", CLOUD);
  vi.stubGlobal("fetch", fetchMock);
  cloudinary.config({ cloud_name: CLOUD, api_secret: SECRET, secure: true });
  explicit.mockReset().mockImplementation(() => {
    throw new Error("Provider transformations must be explicitly mocked.");
  });
  fetchMock.mockReset().mockImplementation(() => {
    throw new Error("Live delivery calls are prohibited in unit tests.");
  });
  vi.mocked(getAssetById)
    .mockReset()
    .mockImplementation(async () => {
      throw new Error("Provider reads must be explicitly mocked.");
    });
  vi.mocked(getCloudinary)
    .mockReset()
    .mockReturnValue({
      url: cloudinary.url.bind(cloudinary),
      uploader: { explicit },
      api: {},
    } as unknown as ReturnType<typeof getCloudinary>);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("exact derivative URL authorization", () => {
  it.each(recipeMetadata)(
    "signs only the canonical $id recipe path",
    ({ id }) => {
      const transformation = getRecipeTransformation(id);
      const result = new URL(getDerivativeUrl(ASSET, id));
      const expected = new URL(
        cloudinary.url(ASSET.publicId, {
          type: "authenticated",
          resource_type: "image",
          version: ASSET.version,
          raw_transformation: transformation,
          format: "webp",
          secure: true,
          sign_url: true,
          signature_algorithm: "sha256",
        }),
      );
      expect(result.origin).toBe("https://res.cloudinary.com");
      expect(result.pathname).toBe(expected.pathname);
      expect(result.pathname).toMatch(
        /^\/synthetic-derivative-cloud\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\//,
      );
      expect(result.pathname).toContain(
        `/${transformation}/v${ASSET.version}/${ASSET.publicId}.webp`,
      );
      expect(result.pathname).not.toContain("f_auto");
      expect(result.pathname).not.toContain("q_auto");
      expect(result.searchParams.has("api_secret")).toBe(false);
      expect(result.toString()).not.toContain(SECRET);
      expect(getAssetById).not.toHaveBeenCalled();
      expect(explicit).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("fails if the SDK cannot authorize the helper-generated path", () => {
    vi.mocked(getCloudinary).mockReturnValue({
      url: () =>
        `https://res.cloudinary.com/${CLOUD}/image/authenticated/example.webp`,
    } as unknown as ReturnType<typeof getCloudinary>);
    expect(() => getDerivativeUrl(ASSET, "storefront")).toThrow(
      "could not be authorized",
    );
  });

  it("fails if the SDK signs a different transformation path", () => {
    vi.mocked(getCloudinary).mockReturnValue({
      url: () =>
        `https://res.cloudinary.com/${CLOUD}/image/authenticated/s--abcdefgh--/c_fill,w_1/v${ASSET.version}/${ASSET.publicId}.webp`,
    } as unknown as ReturnType<typeof getCloudinary>);
    expect(() => getDerivativeUrl(ASSET, "storefront")).toThrow(
      "differs from its authorization",
    );
  });
});

describe("current source provenance", () => {
  it("accepts exact immutable identity, image facts, tag, and session ownership", () => {
    expect(() =>
      assertCurrentSource(sourceReadback(), ASSET, SESSION_ID),
    ).not.toThrow();
    expect(getCloudinary).not.toHaveBeenCalled();
    expect(getAssetById).not.toHaveBeenCalled();
  });

  it.each([
    ["asset identity", { asset_id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
    ["public identity", { public_id: "another/source" }],
    ["version", { version: ASSET.version + 1 }],
    ["width", { width: ASSET.width + 1 }],
    ["height", { height: ASSET.height + 1 }],
    ["bytes", { bytes: ASSET.bytes + 1 }],
    ["format", { format: "png" }],
    ["tag", { tags: ["unrelated-project"] }],
    [
      "session",
      { context: { custom: { pipeline_session_id: OTHER_SESSION_ID } } },
    ],
    ["missing session context", { context: {} }],
    ["wrong resource type", { resource_type: "video" }],
    ["public delivery", { type: "upload" }],
    ["noninteger version", { version: ASSET.version + 0.5 }],
    ["missing asset identity", { asset_id: undefined }],
  ] as const)("rejects changed %s", (_label, overrides) => {
    expect(() =>
      assertCurrentSource(sourceReadback(overrides), ASSET, SESSION_ID),
    ).toThrow(RequestInputError);
  });

  it.each([null, undefined, {}, [], "a provider error"])(
    "rejects malformed source evidence %j",
    (input) => {
      expect(() => assertCurrentSource(input, ASSET, SESSION_ID)).toThrow(
        RequestInputError,
      );
    },
  );
});

describe("decoded derivative evidence", () => {
  it.each(recipeMetadata)(
    "decodes all $id pixels and records the delivered-byte hash",
    async ({ id }) => {
      const bytes = webpBuffers.get(id)!;
      await expect(inspectDerivativeBytes(bytes, id)).resolves.toEqual({
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(recipeMetadata)(
    "rejects another recipe's dimensions for $id",
    async ({ id }) => {
      const other = id === "storefront" ? "social" : "storefront";
      await expect(
        inspectDerivativeBytes(webpBuffers.get(other)!, id),
      ).rejects.toThrow();
    },
  );

  it("rejects a correctly sized PNG regardless of the delivery content type", async () => {
    const png = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(inspectDerivativeBytes(png, "storefront")).rejects.toThrow(
      "does not match",
    );
  });

  it.each([
    Buffer.alloc(0),
    Buffer.from("not an image"),
    Buffer.alloc(MAX_INGESTION_BYTES + 1),
  ])("rejects empty, corrupt, or oversized bytes (%#)", async (bytes) => {
    await expect(inspectDerivativeBytes(bytes, "storefront")).rejects.toThrow();
  });

  it("rejects truncated WebP data regardless of whether its header can be read", async () => {
    const original = webpBuffers.get("storefront")!;
    const truncated = original.subarray(0, original.length - 16);
    await expect(
      inspectDerivativeBytes(truncated, "storefront"),
    ).rejects.toThrow();
  });

  it("rejects multiple WebP frames rather than accepting the first frame's dimensions", async () => {
    const pixels = Buffer.alloc(1200 * 2400 * 3, 20);
    pixels.fill(220, 1200 * 1200 * 3);
    const animated = await sharp(pixels, {
      raw: { width: 1200, height: 2400, channels: 3, pageHeight: 1200 },
    })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(animated).metadata()).pages).toBe(2);
    await expect(
      inspectDerivativeBytes(animated, "storefront"),
    ).rejects.toThrow("does not match");
  });

  it("rejects images above the decoded pixel cap", async () => {
    const bytes = await sharp({
      create: { width: 2100, height: 2100, channels: 3, background: "white" },
    })
      .webp()
      .toBuffer();
    await expect(inspectDerivativeBytes(bytes, "storefront")).rejects.toThrow();
  });
});

describe("bounded authenticated delivery reads", () => {
  const deliveryUrl = `https://res.cloudinary.com/${CLOUD}/image/authenticated/s--abcdefgh--/v1/example.webp`;

  it("reads only the exact authenticated Cloudinary origin with redirects disabled", async () => {
    const bytes = webpBuffers.get("storefront")!;
    fetchMock.mockResolvedValue(imageResponse(bytes));
    await expect(downloadVerifiedBytes(deliveryUrl)).resolves.toEqual(bytes);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(deliveryUrl, {
      redirect: "error",
      cache: "no-store",
      signal: expect.any(AbortSignal),
    });
  });

  it.each([
    "http://res.cloudinary.com/synthetic-derivative-cloud/image/authenticated/example.webp",
    "https://res.cloudinary.com.attacker.test/synthetic-derivative-cloud/image/authenticated/example.webp",
    "https://res.cloudinary.com:8443/synthetic-derivative-cloud/image/authenticated/example.webp",
    "https://attacker.test/synthetic-derivative-cloud/image/authenticated/example.webp",
    "https://username:password@res.cloudinary.com/synthetic-derivative-cloud/image/authenticated/example.webp",
    "https://res.cloudinary.com/another-cloud/image/authenticated/example.webp",
    "https://res.cloudinary.com/synthetic-derivative-cloud/image/upload/example.webp",
    "https://res.cloudinary.com/synthetic-derivative-cloud/image/authenticated-malicious/example.webp",
    "https://res.cloudinary.com/synthetic-derivative-cloud/image/authenticated/../../../another-cloud/image/upload/example.webp",
    "file:///etc/passwd",
    "not a URL",
  ])("rejects an untrusted target without fetching: %s", async (url) => {
    await expect(downloadVerifiedBytes(url)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["failed status", () => imageResponse(undefined, { status: 404 })],
    [
      "redirect status",
      () =>
        imageResponse(undefined, {
          status: 302,
          headers: { location: "https://attacker.test/" },
        }),
    ],
    [
      "Cloudinary error header",
      () =>
        imageResponse(undefined, {
          headers: {
            "content-type": "image/webp",
            "x-cld-error": "upstream synthetic error",
          },
        }),
    ],
    [
      "HTML content",
      () =>
        imageResponse(undefined, { headers: { "content-type": "text/html" } }),
    ],
    [
      "wrong image format",
      () =>
        imageResponse(undefined, { headers: { "content-type": "image/png" } }),
    ],
    ["missing content type", () => imageResponse(undefined, { headers: {} })],
    ["empty response", () => imageResponse(new Uint8Array())],
    [
      "missing body",
      () => new Response(null, { headers: { "content-type": "image/webp" } }),
    ],
  ] as const)("fails closed for %s", async (_label, response) => {
    fetchMock.mockResolvedValue(response());
    await expect(downloadVerifiedBytes(deliveryUrl)).rejects.toThrow();
  });

  it("accepts a content-type parameter without changing the allowed media format", async () => {
    fetchMock.mockResolvedValue(
      imageResponse(undefined, {
        headers: { "content-type": "image/webp; charset=binary" },
      }),
    );
    await expect(downloadVerifiedBytes(deliveryUrl)).resolves.toEqual(
      webpBuffers.get("storefront"),
    );
  });

  it("cancels an oversized declared body before reading it", async () => {
    const response = imageResponse(undefined, {
      headers: {
        "content-type": "image/webp",
        "content-length": `${MAX_INGESTION_BYTES + 1}`,
      },
    });
    const cancel = vi.spyOn(response.body!, "cancel");
    fetchMock.mockResolvedValue(response);
    await expect(downloadVerifiedBytes(deliveryUrl)).rejects.toThrow(
      "delivery limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("enforces the actual streamed byte cap even when the declared length is smaller", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_INGESTION_BYTES));
        controller.enqueue(new Uint8Array(1));
      },
      cancel,
    });
    fetchMock.mockResolvedValue(
      new Response(body, {
        headers: { "content-type": "image/webp", "content-length": "1" },
      }),
    );
    await expect(downloadVerifiedBytes(deliveryUrl)).rejects.toThrow(
      "delivery limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });

  it("propagates rejected delivery reads without issuing a second request", async () => {
    fetchMock.mockRejectedValue(new Error("synthetic redirect rejection"));
    await expect(downloadVerifiedBytes(deliveryUrl)).rejects.toThrow(
      "synthetic redirect rejection",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("uploaded derivative verification workflow", () => {
  it.each(recipeMetadata)(
    "verifies the $id eager artifact, Admin readback, and delivered bytes",
    async ({ id, width, height }) => {
      configureSuccess(id);
      const result = await prepareUploadedDerivative(ASSET, id, SESSION_ID);
      const transformation = getRecipeTransformation(id);
      const bytes = webpBuffers.get(id)!;
      expect(result).toEqual({
        source: {
          assetId: ASSET.assetId,
          publicId: ASSET.publicId,
          version: ASSET.version,
        },
        recipe: id,
        transformation,
        derivedAssetId: "abcdef0123456789abcdef0123456789",
        width,
        height,
        format: "webp",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        verifiedAt: NOW.toISOString(),
      });
      expect(explicit).toHaveBeenCalledExactlyOnceWith(ASSET.publicId, {
        type: "authenticated",
        resource_type: "image",
        eager: `${transformation}/webp`,
        eager_async: false,
        timeout: 20_000,
      });
      expect(getAssetById).toHaveBeenCalledTimes(2);
      expect(getAssetById).toHaveBeenNthCalledWith(1, ASSET.assetId);
      expect(getAssetById).toHaveBeenNthCalledWith(2, ASSET.assetId);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][0]).toBe(getDerivativeUrl(ASSET, id));
    },
  );

  it("accepts a canonical transformation without the redundant WebP suffix", async () => {
    vi.mocked(getAssetById)
      .mockResolvedValueOnce(sourceReadback())
      .mockResolvedValueOnce(
        derivedReadback(
          "storefront",
          {},
          { transformation: getRecipeTransformation("storefront") },
        ),
      );
    explicit.mockResolvedValue(
      eagerResponse(
        "storefront",
        {},
        { transformation: getRecipeTransformation("storefront") },
      ),
    );
    fetchMock.mockResolvedValue(imageResponse());
    await expect(
      prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
    ).resolves.toMatchObject({ format: "webp", recipe: "storefront" });
  });

  it("does not generate anything after failed source re-verification", async () => {
    vi.mocked(getAssetById).mockResolvedValue(
      sourceReadback({ version: ASSET.version + 1 }),
    );
    await expect(
      prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
    ).rejects.toThrow(RequestInputError);
    expect(getAssetById).toHaveBeenCalledOnce();
    expect(explicit).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not generate anything when the source lookup fails", async () => {
    vi.mocked(getAssetById).mockRejectedValue(
      new Error("synthetic Admin API outage"),
    );
    await expect(
      prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
    ).rejects.toThrow("synthetic Admin API outage");
    expect(explicit).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not continue after an eager provider failure", async () => {
    vi.mocked(getAssetById).mockResolvedValue(sourceReadback());
    explicit.mockRejectedValue(new Error("synthetic eager failure"));
    await expect(
      prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
    ).rejects.toThrow("synthetic eager failure");
    expect(getAssetById).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["asset ID", { asset_id: "ffffffffffffffffffffffffffffffff" }, {}],
    ["public ID", { public_id: "another/source" }, {}],
    ["version", { version: ASSET.version + 1 }, {}],
    ["resource type", { resource_type: "video" }, {}],
    ["delivery type", { type: "upload" }, {}],
    ["missing eager evidence", { eager: [] }, {}],
    ["transformation", {}, { transformation: "c_fill,w_1" }],
    ["width", {}, { width: 1199 }],
    ["height", {}, { height: 1199 }],
    ["format", {}, { format: "png" }],
    ["bytes", {}, { bytes: 0 }],
  ] as const)(
    "rejects eager %s mismatches before readback or delivery",
    async (_label, overrides, itemOverrides) => {
      vi.mocked(getAssetById).mockResolvedValue(sourceReadback());
      explicit.mockResolvedValue(
        eagerResponse("storefront", overrides, itemOverrides),
      );
      await expect(
        prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
      ).rejects.toThrow();
      expect(getAssetById).toHaveBeenCalledOnce();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["source asset ID", { asset_id: "ffffffffffffffffffffffffffffffff" }, {}],
    ["source public ID", { public_id: "another/source" }, {}],
    ["source version", { version: ASSET.version + 1 }, {}],
    ["resource type", { resource_type: "video" }, {}],
    ["delivery type", { type: "upload" }, {}],
    ["missing derivative", { derived: [] }, {}],
    ["derived identifier", {}, { id: "bad-id" }],
    ["derived transformation", {}, { transformation: "c_fill,w_1" }],
    ["derived format", {}, { format: "png" }],
    ["derived byte count", {}, { bytes: 1 }],
  ] as const)(
    "rejects Admin %s mismatches before delivery",
    async (_label, overrides, itemOverrides) => {
      vi.mocked(getAssetById)
        .mockResolvedValueOnce(sourceReadback())
        .mockResolvedValueOnce(
          derivedReadback("storefront", overrides, itemOverrides),
        );
      explicit.mockResolvedValue(eagerResponse("storefront"));
      await expect(
        prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
      ).rejects.toThrow();
      expect(getAssetById).toHaveBeenCalledTimes(2);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("fails if Admin readback is unavailable after eager generation", async () => {
    vi.mocked(getAssetById)
      .mockResolvedValueOnce(sourceReadback())
      .mockRejectedValueOnce(new Error("synthetic readback outage"));
    explicit.mockResolvedValue(eagerResponse("storefront"));
    await expect(
      prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
    ).rejects.toThrow("synthetic readback outage");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects delivered bytes that differ from the eager and Admin byte count", async () => {
    const wrongBytes = webpBuffers.get("storefront")!.length + 1;
    vi.mocked(getAssetById)
      .mockResolvedValueOnce(sourceReadback())
      .mockResolvedValueOnce(
        derivedReadback("storefront", {}, { bytes: wrongBytes }),
      );
    explicit.mockResolvedValue(
      eagerResponse("storefront", {}, { bytes: wrongBytes }),
    );
    fetchMock.mockResolvedValue(imageResponse());
    await expect(
      prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
    ).rejects.toThrow("delivered bytes differ");
  });

  it("rejects a correctly served image with the wrong decoded recipe dimensions", async () => {
    configureSuccess();
    fetchMock.mockResolvedValue(imageResponse(webpBuffers.get("social")!));
    await expect(
      prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
    ).rejects.toThrow("does not match");
  });

  it("fails closed if the final delivery check fails", async () => {
    configureSuccess();
    fetchMock.mockResolvedValue(imageResponse(undefined, { status: 403 }));
    await expect(
      prepareUploadedDerivative(ASSET, "storefront", SESSION_ID),
    ).rejects.toThrow("not delivered as WebP");
    expect(explicit).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
