import { NextResponse } from "next/server";
import { runIdInputSchema } from "@/lib/execution/requests";
import { readBoundedJson, RequestInputError } from "@/lib/http/json";
import { assertSameOrigin, getReviewerSession } from "@/lib/server/ingestion";
import { releaseExecution, toExecutionResponse } from "@/lib/server/execution";
import { executionErrorResponse } from "@/lib/server/execution-response";
import { privateResponseHeaders } from "@/lib/server/ingestion-response";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = runIdInputSchema.safeParse(
      await readBoundedJson(request, 1024),
    );
    if (!input.success)
      throw new RequestInputError("Select the current run to release.", 400);
    const session = await getReviewerSession();
    const released = await releaseExecution(input.data.runId, session.id);
    return NextResponse.json(
      { ...toExecutionResponse(released.run), manifest: released.manifest },
      { headers: privateResponseHeaders },
    );
  } catch (error) {
    return executionErrorResponse(error);
  }
}
