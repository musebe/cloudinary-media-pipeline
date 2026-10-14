import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { runIdInputSchema } from "@/lib/execution/requests";
import { readBoundedJson, RequestInputError } from "@/lib/http/json";
import { assertSameOrigin, getReviewerSession } from "@/lib/server/ingestion";
import { readRun, storeRun, toExecutionResponse } from "@/lib/server/execution";
import { executionErrorResponse } from "@/lib/server/execution-response";
import { privateResponseHeaders } from "@/lib/server/ingestion-response";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = runIdInputSchema.safeParse(
      await readBoundedJson(request, 1024),
    );
    if (!input.success)
      throw new RequestInputError(
        "Select the current run to review again.",
        400,
      );
    const session = await getReviewerSession();
    const previous = await readRun(session.id, input.data.runId);
    const run = {
      ...previous,
      id: randomUUID(),
      status: "review" as const,
      review: null,
      releasedAt: null,
      createdAt: new Date().toISOString(),
      expiresAt: Math.floor(Date.now() / 1000) + 1200,
    };
    await storeRun(run, session.id);
    return NextResponse.json(toExecutionResponse(run), {
      headers: privateResponseHeaders,
    });
  } catch (error) {
    return executionErrorResponse(error);
  }
}
