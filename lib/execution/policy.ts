import {
  verifiedAssetSchema,
  type VerifiedAsset,
} from "@/lib/ingestion/contracts";
import { recipeMetadata } from "@/lib/pipeline/contracts";

import {
  getRecipeTransformation,
  inspectionSchema,
  runSchema,
  type ExecutionRun,
  type InspectionEvidence,
  type ReleaseDecision,
  type SourceIdentity,
} from "./contracts";

export function createInspection(
  asset: VerifiedAsset,
  evidenceOrigin: InspectionEvidence["evidenceOrigin"],
  checkedAt: string,
): InspectionEvidence {
  verifiedAssetSchema.parse(asset);
  return inspectionSchema.parse({
    source: {
      assetId: asset.assetId,
      publicId: asset.publicId,
      version: asset.version,
    },
    method: "asset-metadata",
    evidenceOrigin,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    format: asset.format,
    checkedAt,
    contentReviewRequired: true,
  });
}

function block(code: ReleaseDecision["code"], reason: string): ReleaseDecision {
  return { allowed: false, code, reason };
}

function sameSource(source: SourceIdentity, asset: VerifiedAsset): boolean {
  return (
    source.assetId === asset.assetId &&
    source.publicId === asset.publicId &&
    source.version === asset.version
  );
}

function epochSeconds(value: string): number {
  return Math.floor(Date.parse(value) / 1_000);
}

function validateEvidence(run: ExecutionRun): ReleaseDecision | null {
  if (
    run.asset.recipe !== run.recipe ||
    !sameSource(run.inspection.source, run.asset) ||
    !sameSource(run.derivative.source, run.asset)
  ) {
    return block(
      "source_mismatch",
      "The inspection and derivative must refer to the verified source, version, and selected recipe.",
    );
  }

  if (
    run.inspection.width !== run.asset.width ||
    run.inspection.height !== run.asset.height ||
    run.inspection.bytes !== run.asset.bytes ||
    run.inspection.format !== run.asset.format
  ) {
    return block(
      "inspection_mismatch",
      "Inspection facts do not match the verified source image.",
    );
  }

  const output = recipeMetadata.find((item) => item.id === run.recipe)!;
  if (
    run.derivative.recipe !== run.recipe ||
    run.derivative.transformation !== getRecipeTransformation(run.recipe) ||
    run.derivative.width !== output.width ||
    run.derivative.height !== output.height
  ) {
    return block(
      "derivative_mismatch",
      "The verified derivative does not match the selected fixed output recipe.",
    );
  }

  return null;
}

function validateReview(
  run: ExecutionRun,
  nowSeconds: number,
): ReleaseDecision | null {
  if (run.status === "rejected") {
    return block(
      "review_rejected",
      "This output was rejected by its reviewer.",
    );
  }
  if (run.status === "review" || run.review === null) {
    return block(
      "review_required",
      "Approve the image's composition, content, and usage rights before release.",
    );
  }

  const review = run.review;
  if (
    review.runId !== run.id ||
    review.assetId !== run.asset.assetId ||
    review.version !== run.asset.version ||
    review.recipe !== run.recipe ||
    review.derivativeSha256 !== run.derivative.sha256
  ) {
    return block(
      "review_mismatch",
      "The approval belongs to another run, source version, output recipe, or derivative.",
    );
  }
  if (!Object.values(review.checks).every((accepted) => accepted)) {
    return block(
      "review_incomplete",
      "Every required human review check must be accepted before release.",
    );
  }

  const reviewedAt = epochSeconds(review.reviewedAt);
  if (reviewedAt < epochSeconds(run.createdAt) || reviewedAt > nowSeconds) {
    return block(
      "review_time_invalid",
      "The approval timestamp must belong to the current run and not be in the future.",
    );
  }

  if (
    (run.status === "approved" && run.releasedAt !== null) ||
    (run.status === "released" &&
      (run.releasedAt === null ||
        epochSeconds(run.releasedAt) < reviewedAt ||
        epochSeconds(run.releasedAt) > nowSeconds))
  ) {
    return block(
      "invalid_release_state",
      "The release state must record a delivery time after approval.",
    );
  }

  return null;
}

/** Human checks are attestations, not AI moderation or legal rights verification. */
export function evaluateRelease(
  input: unknown,
  nowSeconds: number,
): ReleaseDecision {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) {
    return block(
      "invalid_run",
      "The execution evidence is missing or invalid.",
    );
  }
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) {
    return block("invalid_clock", "A valid server timestamp is required.");
  }

  const run = parsed.data;
  const createdAt = epochSeconds(run.createdAt);
  if (run.expiresAt <= nowSeconds || run.expiresAt <= createdAt) {
    return block(
      "run_expired",
      "The run has expired. Prepare and review it again.",
    );
  }
  if (createdAt > nowSeconds) {
    return block(
      "run_not_started",
      "The run's creation time is in the future.",
    );
  }

  const evidenceFailure = validateEvidence(run);
  if (evidenceFailure) return evidenceFailure;

  const reviewFailure = validateReview(run, nowSeconds);
  if (reviewFailure) return reviewFailure;

  return {
    allowed: true,
    code: "release_allowed",
    reason:
      "The fixed derivative is verified and all required human checks are approved.",
  };
}
