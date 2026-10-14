import { describe, expect, it } from "vitest";

import {
  derivativeSchema,
  getRecipeTransformation,
  inspectionSchema,
  reviewSchema,
  sourceIdentitySchema,
} from "@/lib/execution/contracts";

const source = {
  assetId: "01f910f279e24903bedbebdbaaa16339",
  publicId: "media-pipeline/originals/164b987a-99f4-4f10-9ba1-71010bc1a2dc",
  version: 1_791_984_727,
};
const derivative = {
  source,
  recipe: "storefront",
  transformation: "b_white,c_pad,h_1200,w_1200/q_80",
  derivedAssetId: "02f910f279e24903bedbebdbaaa16339",
  width: 1_200,
  height: 1_200,
  format: "webp",
  bytes: 100_000,
  sha256: "a".repeat(64),
  verifiedAt: "2026-10-14T13:30:00.000Z",
};
const inspection = {
  source,
  method: "asset-metadata",
  evidenceOrigin: "saved-cloudinary",
  width: 1_870,
  height: 1_250,
  bytes: 379_132,
  format: "jpg",
  checkedAt: "2026-10-14T13:30:00.000Z",
  contentReviewRequired: true,
};

describe("fixed transformation contracts", () => {
  it.each([
    ["storefront", "b_white,c_pad,h_1200,w_1200/q_80"],
    ["social", "c_fill,g_center,h_630,w_1200/q_80"],
    ["catalog", "b_white,c_pad,h_1600,w_1600/q_80"],
  ] as const)("uses only the bounded parameters for %s", (recipe, expected) => {
    expect(getRecipeTransformation(recipe)).toBe(expected);
    expect(getRecipeTransformation(recipe)).not.toMatch(/e_gen_|fetch|overlay/);
  });
});

describe("execution evidence schemas", () => {
  it("pins the source identity and validates the fixed output evidence", () => {
    expect(sourceIdentitySchema.parse(source)).toEqual(source);
    expect(derivativeSchema.parse(derivative)).toEqual(derivative);
    expect(inspectionSchema.parse(inspection)).toEqual(inspection);
  });

  it.each([
    { assetId: "not-an-asset" },
    { publicId: "another-project/source" },
    { version: 0 },
    { version: 1.1 },
    { version: "1791984727" },
    { url: "https://evil.test" },
  ])("rejects malformed or extended source identities %j", (change) => {
    expect(
      sourceIdentitySchema.safeParse({ ...source, ...change }).success,
    ).toBe(false);
  });

  it.each([
    { derivedAssetId: "another-derivative" },
    { recipe: "arbitrary" },
    { transformation: "" },
    { width: 0 },
    { height: 1.2 },
    { bytes: -1 },
    { bytes: Number.POSITIVE_INFINITY },
    { bytes: 4_000_001 },
    { format: "jpg" },
    { sha256: "a".repeat(63) },
    { sha256: "A".repeat(64) },
    { verifiedAt: "yesterday" },
    { verifiedAt: "2026-10-14T13:30:00" },
    { deliveryUrl: "https://evil.test" },
  ])("rejects malformed or extended derivative evidence %j", (change) => {
    expect(
      derivativeSchema.safeParse({ ...derivative, ...change }).success,
    ).toBe(false);
  });

  it.each([
    { method: "ai-analysis" },
    { evidenceOrigin: "browser" },
    { contentReviewRequired: false },
    { quality: 1 },
    { contentSafe: true },
  ])(
    "keeps metadata inspection separate from semantic judgments %j",
    (change) => {
      expect(
        inspectionSchema.safeParse({ ...inspection, ...change }).success,
      ).toBe(false);
    },
  );

  it("requires booleans for every human attestation and no extra permissions", () => {
    const review = {
      runId: "3b2718ca-bf64-4143-9664-db83bf7924bd",
      assetId: source.assetId,
      version: source.version,
      recipe: "storefront",
      derivativeSha256: derivative.sha256,
      checks: { composition: true, content: true, rights: true },
      reviewedAt: "2026-10-14T13:30:00.000Z",
    };
    expect(reviewSchema.safeParse(review).success).toBe(true);
    expect(
      reviewSchema.safeParse({ ...review, checks: { composition: true } })
        .success,
    ).toBe(false);
    expect(
      reviewSchema.safeParse({
        ...review,
        checks: { ...review.checks, rights: "yes" },
      }).success,
    ).toBe(false);
    expect(
      reviewSchema.safeParse({
        ...review,
        checks: { ...review.checks, bypass: true },
      }).success,
    ).toBe(false);
    expect(
      reviewSchema.safeParse({ ...review, approvedByAi: true }).success,
    ).toBe(false);
  });
});
