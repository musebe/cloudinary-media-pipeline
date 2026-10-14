import { cookies } from "next/headers";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import recordedOutputs from "@/fixtures/demo-outputs.json";
import { demoFixture } from "@/lib/demo";
import {
  derivativeSchema,
  type ExecutionRun,
  type VerifiedDerivative,
} from "@/lib/execution/contracts";
import { createInspection } from "@/lib/execution/policy";
import { MAX_TOKEN_LENGTH, openToken, sealToken } from "@/lib/ingestion/tokens";
import type { PipelineRecipe } from "@/lib/pipeline/contracts";
import {
  readPinnedSavedOutput,
  readSavedOutput,
} from "@/lib/server/demo-outputs";
import {
  downloadVerifiedBytes,
  getDerivativeUrl,
  inspectDerivativeBytes,
  prepareUploadedDerivative,
} from "@/lib/server/derivatives";
import {
  prepareExecution,
  readRun,
  readRunOutput,
  releaseExecution,
  reviewExecution,
  storeRun,
  toExecutionResponse,
} from "@/lib/server/execution";
import {
  readCurrentReviewImage,
  requireIngestionEnabled,
  sessionSecret,
} from "@/lib/server/ingestion";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/lib/server/ingestion", () => ({
  readCurrentReviewImage: vi.fn(),
  requireIngestionEnabled: vi.fn(),
  sessionSecret: vi.fn(),
}));
vi.mock("@/lib/server/demo-outputs", () => ({
  readSavedOutput: vi.fn(),
  readPinnedSavedOutput: vi.fn(),
}));
vi.mock("@/lib/server/derivatives", () => ({
  downloadVerifiedBytes: vi.fn(),
  getDerivativeUrl: vi.fn(),
  inspectDerivativeBytes: vi.fn(),
  prepareUploadedDerivative: vi.fn(),
}));

const SECRET = "synthetic-execution-secret-at-least-32-characters";
const SESSION_ID = "3b2718ca-bf64-4143-9664-db83bf7924bd";
const OTHER_SESSION = "af8e9b29-1a65-4d6e-aada-9a344577890d";
const RUN_ID = "d631924d-e78f-4bf6-9e39-f4b7d59fdad5";
const NOW = new Date("2026-10-14T15:00:00.745Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const RUN_COOKIE = "media-pipeline-current-run";
const DEMO_BYTES = Buffer.from("synthetic decoded bytes: no provider request");
const cookieValues = new Map<string, string>();
const cookieStore = { get: vi.fn(), set: vi.fn() };
const source = demoFixture.cloudinary!.asset;

function derivativeFor(recipe: PipelineRecipe): VerifiedDerivative {
  return derivativeSchema.parse(
    recordedOutputs.outputs.find((item) => item.derivative.recipe === recipe)!
      .derivative,
  );
}

function makeRun(): ExecutionRun {
  const asset = { ...source, recipe: "storefront" as const };
  return {
    id: RUN_ID,
    kind: "demo",
    recipe: "storefront",
    prompt: "Prepare the storefront image and require review.",
    asset,
    inspection: createInspection(asset, "saved-cloudinary", asset.verifiedAt),
    derivative: derivativeFor("storefront"),
    status: "review",
    review: null,
    createdAt: NOW.toISOString(),
    expiresAt: NOW_SECONDS + 1_200,
    releasedAt: null,
  };
}

function approvedRun(): ExecutionRun {
  const run = makeRun();
  return {
    ...run,
    status: "approved",
    review: {
      runId: run.id,
      assetId: run.asset.assetId,
      version: run.asset.version,
      recipe: run.recipe,
      derivativeSha256: run.derivative.sha256,
      checks: { composition: true, content: true, rights: true },
      reviewedAt: NOW.toISOString(),
    },
  };
}

function encodedRun(run: ExecutionRun, sessionId = SESSION_ID) {
  return sealToken(
    "run",
    {
      sessionId,
      encodedRun: deflateRawSync(
        Buffer.from(JSON.stringify(run), "utf8"),
      ).toString("base64url"),
    },
    SECRET,
  );
}

function putRun(run: ExecutionRun, sessionId = SESSION_ID) {
  cookieValues.set(RUN_COOKIE, encodedRun(run, sessionId));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("NODE_ENV", "development");
  vi.clearAllMocks();
  cookieValues.clear();
  cookieStore.get.mockImplementation((name: string) => {
    const value = cookieValues.get(name);
    return value ? { value } : undefined;
  });
  cookieStore.set.mockImplementation((name: string, value: string) => {
    cookieValues.set(name, value);
  });
  vi.mocked(cookies).mockResolvedValue(
    cookieStore as unknown as Awaited<ReturnType<typeof cookies>>,
  );
  vi.mocked(sessionSecret).mockReturnValue(SECRET);
  vi.mocked(requireIngestionEnabled).mockImplementation(() => {});
  vi.mocked(readCurrentReviewImage).mockResolvedValue(source);
  vi.mocked(readSavedOutput).mockImplementation(async (recipe) => ({
    bytes: DEMO_BYTES,
    derivative: derivativeFor(recipe),
  }));
  vi.mocked(readPinnedSavedOutput).mockResolvedValue(DEMO_BYTES);
  vi.mocked(prepareUploadedDerivative).mockImplementation(
    async (_asset, recipe) => derivativeFor(recipe),
  );
  vi.mocked(getDerivativeUrl).mockReturnValue(
    "https://res.cloudinary.com/synthetic/image/authenticated/s--testtest--/source.webp",
  );
  vi.mocked(downloadVerifiedBytes).mockResolvedValue(DEMO_BYTES);
  vi.mocked(inspectDerivativeBytes).mockImplementation(
    async (_bytes, recipe) => {
      const derivative = derivativeFor(recipe);
      return { bytes: derivative.bytes, sha256: derivative.sha256 };
    },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("session-scoped execution receipts", () => {
  it("stores HTTP-only, strict, production-secure and path-scoped run cookies", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const run = makeRun();
    await storeRun(run, SESSION_ID);
    expect(cookieStore.set).toHaveBeenCalledWith(
      RUN_COOKIE,
      expect.any(String),
      {
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        path: "/api/pipelines",
        maxAge: 1_200,
      },
    );
    const receipt = openToken("run", cookieValues.get(RUN_COOKIE)!, SECRET) as {
      sessionId: string;
      encodedRun: string;
    };
    expect(receipt.sessionId).toBe(SESSION_ID);
    expect(Object.keys(receipt).sort()).toEqual(["encodedRun", "sessionId"]);
    const normalized = JSON.parse(
      inflateRawSync(Buffer.from(receipt.encodedRun, "base64url")).toString(
        "utf8",
      ),
    );
    expect(normalized).toEqual({
      ...run,
      asset: { ...run.asset, prompt: "Image review" },
    });
    expect(JSON.stringify(normalized)).not.toMatch(
      /api[_-]?secret|api[_-]?key|synthetic-execution-secret/,
    );
  });

  it("fits a maximum ASCII request, all evidence and approval under the cookie limit", async () => {
    const run = { ...approvedRun(), prompt: "x".repeat(500) };
    await storeRun(run, SESSION_ID);
    const token = cookieValues.get(RUN_COOKIE)!;
    expect(token.length).toBeLessThan(MAX_TOKEN_LENGTH);
    expect((await readRun(SESSION_ID)).prompt).toBe(run.prompt);
  });

  it("fits the supported maximum-length Unicode request after approval", async () => {
    const run = { ...approvedRun(), prompt: "图".repeat(500) };
    await storeRun(run, SESSION_ID);
    expect(cookieValues.get(RUN_COOKIE)!.length).toBeLessThan(MAX_TOKEN_LENGTH);
    expect((await readRun(SESSION_ID)).prompt).toBe(run.prompt);
  });

  it("rejects an authenticated compressed receipt exceeding the inflate limit", async () => {
    const bomb = deflateRawSync(Buffer.from("x".repeat(100_000))).toString(
      "base64url",
    );
    cookieValues.set(
      RUN_COOKIE,
      sealToken("run", { sessionId: SESSION_ID, encodedRun: bomb }, SECRET),
    );
    await expect(readRun(SESSION_ID)).rejects.toMatchObject({ status: 401 });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it.each(["A", "ff", "not-deflate-data"])(
    "rejects noncanonical or malformed compressed data %s",
    async (encodedRun) => {
      cookieValues.set(
        RUN_COOKIE,
        sealToken("run", { sessionId: SESSION_ID, encodedRun }, SECRET),
      );
      await expect(readRun(SESSION_ID)).rejects.toMatchObject({ status: 401 });
    },
  );

  it("rejects non-UTF8 inflated data and legacy or extended envelopes", async () => {
    const malformedUtf8 = deflateRawSync(Buffer.from([0xff, 0xfe])).toString(
      "base64url",
    );
    for (const receipt of [
      { sessionId: SESSION_ID, encodedRun: malformedUtf8 },
      { sessionId: SESSION_ID, run: makeRun() },
      { sessionId: SESSION_ID, encodedRun: "AA", skipApproval: true },
    ]) {
      cookieValues.set(RUN_COOKIE, sealToken("run", receipt, SECRET));
      await expect(readRun(SESSION_ID)).rejects.toMatchObject({ status: 401 });
    }
  });

  it("restores a run only for its session and expected run ID", async () => {
    putRun(makeRun());
    await expect(readRun(SESSION_ID, RUN_ID)).resolves.toMatchObject({
      id: RUN_ID,
    });
    await expect(readRun(OTHER_SESSION)).rejects.toMatchObject({ status: 401 });
    await expect(readRun(SESSION_ID, OTHER_SESSION)).rejects.toMatchObject({
      status: 401,
    });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it.each(["missing", "tampered", "expired", "wrong-domain", "invalid-shape"])(
    "rejects a %s execution receipt",
    async (kind) => {
      if (kind === "tampered") cookieValues.set(RUN_COOKIE, "tampered");
      if (kind === "expired") putRun({ ...makeRun(), expiresAt: NOW_SECONDS });
      if (kind === "wrong-domain")
        cookieValues.set(
          RUN_COOKIE,
          sealToken(
            "receipt",
            { sessionId: SESSION_ID, run: makeRun() },
            SECRET,
          ),
        );
      if (kind === "invalid-shape")
        cookieValues.set(
          RUN_COOKIE,
          sealToken(
            "run",
            {
              sessionId: SESSION_ID,
              encodedRun: deflateRawSync(
                Buffer.from(
                  JSON.stringify({ ...makeRun(), capability: "bypass" }),
                ),
              ).toString("base64url"),
            },
            SECRET,
          ),
        );
      await expect(readRun(SESSION_ID)).rejects.toMatchObject({
        status: 401,
        message:
          "This run is unavailable or expired. Prepare and review the image again.",
      });
    },
  );

  it.each(["review", "approved", "rejected", "released"] as const)(
    "restores the %s workflow state without implicitly approving it",
    async (status) => {
      const run = status === "review" ? makeRun() : approvedRun();
      putRun({
        ...run,
        status,
        releasedAt: status === "released" ? NOW.toISOString() : null,
      });
      const restored = await readRun(SESSION_ID);
      expect(restored.status).toBe(status);
      expect(toExecutionResponse(restored).decision.allowed).toBe(
        status === "approved" || status === "released",
      );
    },
  );
});

describe("execution preparation", () => {
  it("prepares the saved evidence without any upload provider operations", async () => {
    const run = await prepareExecution(
      {
        source: "demo",
        recipe: "storefront",
        prompt: "Prepare the storefront image.",
      },
      SESSION_ID,
    );
    expect(run).toMatchObject({
      kind: "demo",
      recipe: "storefront",
      status: "review",
      review: null,
      releasedAt: null,
      expiresAt: NOW_SECONDS + 1_200,
    });
    expect(run.createdAt).toBe(NOW.toISOString());
    expect(readSavedOutput).toHaveBeenCalledWith("storefront");
    expect(requireIngestionEnabled).not.toHaveBeenCalled();
    expect(readCurrentReviewImage).not.toHaveBeenCalled();
    expect(prepareUploadedDerivative).not.toHaveBeenCalled();
    expect(downloadVerifiedBytes).not.toHaveBeenCalled();
    expect(toExecutionResponse(run)).toMatchObject({
      noNewMediaOperations: true,
      decision: { allowed: false, code: "review_required" },
    });
  });

  it.each(["review", "approved", "rejected", "released"] as const)(
    "makes unchanged %s preparations idempotent without repeating transforms",
    async (status) => {
      const run = status === "review" ? makeRun() : approvedRun();
      const current = {
        ...run,
        status,
        releasedAt: status === "released" ? NOW.toISOString() : null,
      };
      putRun(current);
      expect(
        await prepareExecution(
          { source: "demo", recipe: current.recipe, prompt: current.prompt },
          SESSION_ID,
        ),
      ).toEqual(current);
      expect(readSavedOutput).not.toHaveBeenCalled();
      expect(prepareUploadedDerivative).not.toHaveBeenCalled();
      expect(cookieStore.set).not.toHaveBeenCalled();
    },
  );

  it("discards previous approval when the selected recipe changes", async () => {
    putRun(approvedRun());
    const run = await prepareExecution(
      { source: "demo", recipe: "social", prompt: approvedRun().prompt },
      SESSION_ID,
    );
    expect(run.id).not.toBe(RUN_ID);
    expect(run.recipe).toBe("social");
    expect(run.asset.recipe).toBe("social");
    expect(run.derivative.recipe).toBe("social");
    expect(run.review).toBeNull();
    expect(run.status).toBe("review");
  });

  it("discards previous approval when the display-only request changes", async () => {
    putRun(approvedRun());
    const run = await prepareExecution(
      {
        source: "demo",
        recipe: "storefront",
        prompt: "An updated request must be reviewed.",
      },
      SESSION_ID,
    );
    expect(run.id).not.toBe(RUN_ID);
    expect(run.review).toBeNull();
    expect(run.status).toBe("review");
  });

  it("requires an enabled ingestion path and session-owned source for uploaded work", async () => {
    const run = await prepareExecution(
      {
        source: "upload",
        recipe: "catalog",
        prompt: "Prepare a larger output.",
        assetId: source.assetId,
      },
      SESSION_ID,
    );
    expect(requireIngestionEnabled).toHaveBeenCalledOnce();
    expect(readCurrentReviewImage).toHaveBeenCalledWith(
      SESSION_ID,
      source.assetId,
    );
    expect(prepareUploadedDerivative).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: source.assetId, recipe: "catalog" }),
      "catalog",
      SESSION_ID,
    );
    expect(readSavedOutput).not.toHaveBeenCalled();
    expect(run.inspection.evidenceOrigin).toBe("live-cloudinary");
    expect(toExecutionResponse(run).noNewMediaOperations).toBe(false);
  });

  it("does not store a run when derivative preparation fails", async () => {
    vi.mocked(prepareUploadedDerivative).mockRejectedValue(
      new Error("synthetic provider failure"),
    );
    await expect(
      prepareExecution(
        {
          source: "upload",
          recipe: "storefront",
          prompt: "Prepare the source.",
          assetId: source.assetId,
        },
        SESSION_ID,
      ),
    ).rejects.toThrow("synthetic provider failure");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe("human review gate", () => {
  it("binds explicit review to the server run, source version and derivative hash", async () => {
    putRun(makeRun());
    const reviewed = await reviewExecution(
      {
        runId: RUN_ID,
        decision: "approve",
        checks: { composition: true, content: true, rights: true },
      },
      SESSION_ID,
    );
    expect(reviewed.status).toBe("approved");
    expect(reviewed.review).toEqual({
      runId: RUN_ID,
      assetId: source.assetId,
      version: source.version,
      recipe: "storefront",
      derivativeSha256: derivativeFor("storefront").sha256,
      checks: { composition: true, content: true, rights: true },
      reviewedAt: NOW.toISOString(),
    });
    expect((await readRun(SESSION_ID)).status).toBe("approved");
    expect(prepareUploadedDerivative).not.toHaveBeenCalled();
  });

  it.each(["composition", "content", "rights"] as const)(
    "rejects approval without the %s attestation and preserves review state",
    async (check) => {
      putRun(makeRun());
      await expect(
        reviewExecution(
          {
            runId: RUN_ID,
            decision: "approve",
            checks: {
              composition: true,
              content: true,
              rights: true,
              [check]: false,
            },
          },
          SESSION_ID,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect((await readRun(SESSION_ID)).status).toBe("review");
      expect(cookieStore.set).not.toHaveBeenCalled();
    },
  );

  it("records a rejection without requiring false checks to become accepted", async () => {
    putRun(makeRun());
    const rejected = await reviewExecution(
      {
        runId: RUN_ID,
        decision: "reject",
        checks: { composition: false, content: false, rights: false },
      },
      SESSION_ID,
    );
    expect(rejected.status).toBe("rejected");
    expect(toExecutionResponse(rejected).decision.code).toBe("review_rejected");
    await expect(releaseExecution(RUN_ID, SESSION_ID)).rejects.toMatchObject({
      status: 409,
    });
    expect(readPinnedSavedOutput).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected", "released"] as const)(
    "prevents overwriting an existing %s review",
    async (status) => {
      putRun({
        ...approvedRun(),
        status,
        releasedAt: status === "released" ? NOW.toISOString() : null,
      });
      await expect(
        reviewExecution(
          {
            runId: RUN_ID,
            decision: "approve",
            checks: { composition: true, content: true, rights: true },
          },
          SESSION_ID,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(cookieStore.set).not.toHaveBeenCalled();
    },
  );

  it("rejects cross-session and stale run IDs before writing an approval", async () => {
    putRun(makeRun());
    const request = {
      runId: RUN_ID,
      decision: "approve" as const,
      checks: { composition: true, content: true, rights: true },
    };
    await expect(reviewExecution(request, OTHER_SESSION)).rejects.toMatchObject(
      { status: 401 },
    );
    await expect(
      reviewExecution({ ...request, runId: OTHER_SESSION }, SESSION_ID),
    ).rejects.toMatchObject({ status: 401 });
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});

describe("verified release and private proxy manifest", () => {
  it("blocks release before approval without reading output bytes", async () => {
    putRun(makeRun());
    await expect(releaseExecution(RUN_ID, SESSION_ID)).rejects.toMatchObject({
      status: 409,
    });
    expect(readPinnedSavedOutput).not.toHaveBeenCalled();
    expect(downloadVerifiedBytes).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("verifies saved bytes before release and exposes only session proxy paths", async () => {
    putRun(approvedRun());
    const result = await releaseExecution(RUN_ID, SESSION_ID);
    expect(readPinnedSavedOutput).toHaveBeenCalledWith(
      approvedRun().derivative,
    );
    expect(inspectDerivativeBytes).toHaveBeenCalledWith(
      DEMO_BYTES,
      "storefront",
    );
    expect(result.run.status).toBe("released");
    expect(result.run.releasedAt).toBe(NOW.toISOString());
    expect(result.manifest).toMatchObject({
      authorization: "session-proxy",
      source: approvedRun().derivative.source,
      runId: RUN_ID,
      deliveryUrl: `/api/pipelines/output?run=${RUN_ID}&download=1`,
      evidenceOrigin: "saved-cloudinary",
    });
    expect(JSON.stringify(result.manifest)).not.toMatch(
      /s--|https:\/\/res\.cloudinary\.com|synthetic-execution-secret/,
    );
    expect((await readRun(SESSION_ID)).status).toBe("released");
  });

  it("keeps a repeat release idempotent while rechecking delivery", async () => {
    const releasedAt = "2026-10-14T15:00:00.001Z";
    putRun({ ...approvedRun(), status: "released", releasedAt });
    const result = await releaseExecution(RUN_ID, SESSION_ID);
    expect(result.run.releasedAt).toBe(releasedAt);
    expect(readPinnedSavedOutput).toHaveBeenCalledOnce();
  });

  it.each(["delivery", "checksum", "size"])(
    "leaves the cookie unreleased after a %s verification failure",
    async (failure) => {
      putRun(approvedRun());
      const initialToken = cookieValues.get(RUN_COOKIE);
      if (failure === "delivery")
        vi.mocked(readPinnedSavedOutput).mockRejectedValue(
          new Error("synthetic provider failure"),
        );
      if (failure === "checksum")
        vi.mocked(inspectDerivativeBytes).mockResolvedValue({
          bytes: derivativeFor("storefront").bytes,
          sha256: "b".repeat(64),
        });
      if (failure === "size")
        vi.mocked(inspectDerivativeBytes).mockResolvedValue({
          bytes: derivativeFor("storefront").bytes + 1,
          sha256: derivativeFor("storefront").sha256,
        });
      await expect(releaseExecution(RUN_ID, SESSION_ID)).rejects.toThrow();
      expect(cookieValues.get(RUN_COOKIE)).toBe(initialToken);
      expect((await readRun(SESSION_ID)).status).toBe("approved");
      expect(cookieStore.set).not.toHaveBeenCalled();
    },
  );

  it("downloads only the server-authorized derivative for uploaded runs", async () => {
    const run = { ...approvedRun(), kind: "upload" as const };
    expect(await readRunOutput(run)).toBe(DEMO_BYTES);
    expect(getDerivativeUrl).toHaveBeenCalledWith(run.asset, run.recipe);
    expect(downloadVerifiedBytes).toHaveBeenCalledWith(
      vi.mocked(getDerivativeUrl).mock.results[0].value,
    );
    expect(readPinnedSavedOutput).not.toHaveBeenCalled();
  });

  it("rejects stale or cross-session release requests before verifying delivery", async () => {
    putRun(approvedRun());
    await expect(
      releaseExecution(OTHER_SESSION, SESSION_ID),
    ).rejects.toMatchObject({ status: 401 });
    await expect(releaseExecution(RUN_ID, OTHER_SESSION)).rejects.toMatchObject(
      { status: 401 },
    );
    expect(readPinnedSavedOutput).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
