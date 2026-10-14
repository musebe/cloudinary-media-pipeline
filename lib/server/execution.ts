import "server-only";

import { randomUUID } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { cookies } from "next/headers";
import { z } from "zod";
import { demoFixture } from "@/lib/demo";
import { openToken, sealToken } from "@/lib/ingestion/tokens";
import { runSchema, type ExecutionRun } from "@/lib/execution/contracts";
import { createInspection, evaluateRelease } from "@/lib/execution/policy";
import {
  executeInputSchema,
  reviewInputSchema,
  executionResponseSchema,
  manifestSchema,
} from "@/lib/execution/requests";
import { RequestInputError } from "@/lib/http/json";
import {
  readCurrentReviewImage,
  requireIngestionEnabled,
  sessionSecret,
} from "@/lib/server/ingestion";
import {
  readSavedOutput,
  readPinnedSavedOutput,
} from "@/lib/server/demo-outputs";
import {
  downloadVerifiedBytes,
  getDerivativeUrl,
  inspectDerivativeBytes,
  prepareUploadedDerivative,
} from "@/lib/server/derivatives";

const RUN_COOKIE = "media-pipeline-current-run";
const RUN_SECONDS = 20 * 60;
const MAX_RUN_JSON_BYTES = 8_000;
const runReceiptSchema = z
  .object({
    sessionId: z.uuid(),
    encodedRun: z
      .string()
      .min(1)
      .max(3_000)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export async function storeRun(run: ExecutionRun, sessionId: string) {
  const normalizedRun = runSchema.parse({
    ...run,
    asset: { ...run.asset, prompt: "Image review" },
  });
  const serialized = Buffer.from(JSON.stringify(normalizedRun), "utf8");
  if (serialized.byteLength > MAX_RUN_JSON_BYTES)
    throw new Error("The execution receipt exceeds its storage limit.");
  // Compress bounded evidence so Unicode requests still fit an HTTP cookie.
  // The envelope remains authenticated, not encrypted; it contains no secrets.
  const encodedRun = deflateRawSync(serialized).toString("base64url");
  (await cookies()).set(
    RUN_COOKIE,
    sealToken(
      "run",
      {
        sessionId,
        encodedRun,
      },
      sessionSecret(),
    ),
    {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/api/pipelines",
      maxAge: Math.max(0, run.expiresAt - Math.floor(Date.now() / 1000)),
    },
  );
}

export async function readRun(
  sessionId: string,
  expectedId?: string,
): Promise<ExecutionRun> {
  const token = (await cookies()).get(RUN_COOKIE)?.value;
  try {
    const receipt = runReceiptSchema.parse(
      openToken("run", token ?? "", sessionSecret()),
    );
    // Verify the envelope MAC before allocating or inflating compressed data.
    const compressed = Buffer.from(receipt.encodedRun, "base64url");
    if (compressed.toString("base64url") !== receipt.encodedRun)
      throw new Error("invalid");
    const serialized = inflateRawSync(compressed, {
      maxOutputLength: MAX_RUN_JSON_BYTES,
    });
    const json = new TextDecoder("utf-8", { fatal: true }).decode(serialized);
    const run = runSchema.parse(JSON.parse(json) as unknown);
    if (
      receipt.sessionId !== sessionId ||
      (expectedId && run.id !== expectedId) ||
      run.expiresAt <= Math.floor(Date.now() / 1000)
    )
      throw new Error("invalid");
    return run;
  } catch {
    throw new RequestInputError(
      "This run is unavailable or expired. Prepare and review the image again.",
      401,
    );
  }
}

export async function prepareExecution(
  input: z.infer<typeof executeInputSchema>,
  sessionId: string,
) {
  const request = executeInputSchema.parse(input);
  // Repeated submits are idempotent for this session's unchanged run, including a rejected run.
  try {
    const current = await readRun(sessionId);
    if (
      current.kind === request.source &&
      current.recipe === request.recipe &&
      current.prompt === request.prompt &&
      (request.source === "demo" || current.asset.assetId === request.assetId)
    )
      return current;
  } catch {
    /* No usable current run. Preparing a different image discards prior approval. */
  }
  if (request.source === "upload") requireIngestionEnabled();
  const original =
    request.source === "demo"
      ? demoFixture.cloudinary?.asset
      : await readCurrentReviewImage(sessionId, request.assetId);
  if (!original)
    throw new RequestInputError("The saved demo has no verified source.", 503);
  const asset = { ...original, recipe: request.recipe, prompt: "Image review" };
  const derivative =
    request.source === "demo"
      ? (await readSavedOutput(request.recipe)).derivative
      : await prepareUploadedDerivative(asset, request.recipe, sessionId);
  const now = new Date();
  const run = runSchema.parse({
    id: randomUUID(),
    kind: request.source,
    recipe: request.recipe,
    prompt: request.prompt,
    asset,
    inspection: createInspection(
      asset,
      request.source === "demo" ? "saved-cloudinary" : "live-cloudinary",
      request.source === "demo" ? asset.verifiedAt : now.toISOString(),
    ),
    derivative,
    status: "review",
    review: null,
    createdAt: now.toISOString(),
    expiresAt: Math.floor(now.getTime() / 1000) + RUN_SECONDS,
    releasedAt: null,
  });
  await storeRun(run, sessionId);
  return run;
}

export function toExecutionResponse(run: ExecutionRun) {
  return executionResponseSchema.parse({
    run,
    decision: evaluateRelease(run, Math.floor(Date.now() / 1000)),
    outputImageUrl: `/api/pipelines/output?run=${run.id}`,
    noNewMediaOperations: run.kind === "demo",
  });
}

export async function reviewExecution(
  input: z.infer<typeof reviewInputSchema>,
  sessionId: string,
) {
  const request = reviewInputSchema.parse(input);
  const run = await readRun(sessionId, request.runId);
  if (run.status !== "review")
    throw new RequestInputError(
      "This run already has a review decision. Prepare a different run to start again.",
      409,
    );
  const reviewed: ExecutionRun = {
    ...run,
    status: request.decision === "reject" ? "rejected" : "approved",
    review: {
      runId: run.id,
      assetId: run.asset.assetId,
      version: run.asset.version,
      recipe: run.recipe,
      derivativeSha256: run.derivative.sha256,
      checks: request.checks,
      reviewedAt: new Date().toISOString(),
    },
  };
  if (request.decision === "approve") {
    const decision = evaluateRelease(reviewed, Math.floor(Date.now() / 1000));
    if (!decision.allowed) throw new RequestInputError(decision.reason, 409);
  }
  await storeRun(reviewed, sessionId);
  return reviewed;
}

/** The private proxy rechecks the checksum on every delivery and never redirects to a bearer URL. */
export async function readRunOutput(run: ExecutionRun) {
  const bytes =
    run.kind === "demo"
      ? await readPinnedSavedOutput(run.derivative)
      : await downloadVerifiedBytes(getDerivativeUrl(run.asset, run.recipe));
  const actual = await inspectDerivativeBytes(bytes, run.recipe);
  if (
    actual.sha256 !== run.derivative.sha256 ||
    actual.bytes !== run.derivative.bytes
  )
    throw new Error("The output no longer matches its verified artifact.");
  return bytes;
}

export async function releaseExecution(runId: string, sessionId: string) {
  const run = await readRun(sessionId, runId);
  const decision = evaluateRelease(run, Math.floor(Date.now() / 1000));
  if (!decision.allowed) throw new RequestInputError(decision.reason, 409);
  // Verify delivery still works before creating a manifest; failures leave the run unreleased.
  await readRunOutput(run);
  const released: ExecutionRun = {
    ...run,
    status: "released",
    releasedAt: run.releasedAt ?? new Date().toISOString(),
  };
  await storeRun(released, sessionId);
  return {
    run: released,
    manifest: manifestSchema.parse({
      schemaVersion: "media-pipeline.delivery.v1",
      runId: run.id,
      source: run.derivative.source,
      derivative: run.derivative,
      approvedAt: run.review!.reviewedAt,
      releasedAt: released.releasedAt,
      expiresAt: new Date(run.expiresAt * 1000).toISOString(),
      deliveryUrl: `/api/pipelines/output?run=${run.id}&download=1`,
      authorization: "session-proxy",
      evidenceOrigin: run.inspection.evidenceOrigin,
      disclaimer:
        "Human approval is an attestation, not automated moderation or legal rights verification. This session-scoped demo is not a durable audit store.",
    }),
  };
}
