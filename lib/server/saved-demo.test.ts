import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const demo = vi.hoisted(() => {
  const asset = {
    assetId: "01f910f279e24903bedbebdbaaa16339",
    publicId: "media-pipeline/originals/164b987a-99f4-4f10-9ba1-71010bc1a2dc",
    version: 1_791_979_770,
    width: 1_200,
    height: 900,
    bytes: 1_000,
    format: "png",
    resourceType: "image",
    deliveryType: "authenticated",
    verifiedAt: "2026-10-14T13:30:00.000Z",
    recipe: "storefront",
    prompt: "Saved demo",
    status: "verified",
    executionComplete: false,
  };
  return {
    bundledDemo: {
      imageUrl: "/demo/product-shoe.jpg",
      alt: "Synthetic product fixture",
      width: 1_870,
      height: 1_250,
      asset: null,
      source: "bundled-demo",
    },
    demoFixture: {
      alt: "Synthetic product fixture",
      cloudinary: {
        cloudName: "synthetic-demo",
        sha256: "a".repeat(64),
        asset,
      },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/demo", () => demo);
vi.mock("@/lib/server/ingestion", () => ({ getReviewerImageUrl: vi.fn() }));
vi.mock("@/lib/server/cloudinary", () => ({
  getCloudinary: vi.fn(() => {
    throw new Error("Saved-demo loading must not access provider APIs.");
  }),
  getAssetById: vi.fn(() => {
    throw new Error("Saved-demo loading must not read provider resources.");
  }),
}));

import { getCloudinary, getAssetById } from "@/lib/server/cloudinary";
import { getReviewerImageUrl } from "@/lib/server/ingestion";
import { getSavedDemo } from "@/lib/server/saved-demo";

const REVIEW_URL =
  "https://res.cloudinary.com/synthetic-demo/image/authenticated/s--abcdefgh--/v1791979770/media-pipeline/originals/164b987a-99f4-4f10-9ba1-71010bc1a2dc";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "synthetic-demo");
  vi.stubEnv("CLOUDINARY_API_KEY", "123456789");
  vi.stubEnv("CLOUDINARY_API_SECRET", "synthetic-demo-secret");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ENABLE_LIVE_PIPELINE", "false");
  vi.mocked(getReviewerImageUrl).mockReset().mockReturnValue(REVIEW_URL);
  vi.mocked(getCloudinary).mockClear();
  vi.mocked(getAssetById).mockClear();
});

afterEach(() => {
  expect(getCloudinary).not.toHaveBeenCalled();
  expect(getAssetById).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
});

describe("reusable saved-demo evidence", () => {
  it("loads the bundled fixture when credentials are absent", () => {
    vi.stubEnv("CLOUDINARY_API_SECRET", "");
    expect(getSavedDemo()).toBe(demo.bundledDemo);
    expect(getReviewerImageUrl).not.toHaveBeenCalled();
  });

  it("uses the bundled fixture when the configured cloud does not match the saved reference", () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "other-project");
    expect(getSavedDemo()).toBe(demo.bundledDemo);
    expect(getReviewerImageUrl).not.toHaveBeenCalled();
  });

  it("returns saved immutable evidence with a locally signed original URL", () => {
    const result = getSavedDemo();
    expect(getReviewerImageUrl).toHaveBeenCalledExactlyOnceWith(
      demo.demoFixture.cloudinary.asset,
    );
    expect(result).toEqual({
      imageUrl: REVIEW_URL,
      alt: demo.demoFixture.alt,
      width: 1_200,
      height: 900,
      asset: demo.demoFixture.cloudinary.asset,
      source: "cloudinary-demo",
    });
    expect(result.asset?.executionComplete).toBe(false);
    expect(result.asset?.status).toBe("verified");
  });

  it("reuses the snapshot across requests without analysis, uploads, or Admin API reads", () => {
    const first = getSavedDemo();
    const second = getSavedDemo();
    expect(second.asset).toBe(first.asset);
    expect(second.imageUrl).toBe(first.imageUrl);
    expect(getReviewerImageUrl).toHaveBeenCalledTimes(2);
    expect(first.asset?.verifiedAt).toBe("2026-10-14T13:30:00.000Z");
  });
});
