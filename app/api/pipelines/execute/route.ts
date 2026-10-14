import { NextResponse } from "next/server";
import { executeInputSchema } from "@/lib/execution/requests";
import { readBoundedJson, RequestInputError } from "@/lib/http/json";
import { assertSameOrigin, getReviewerSession } from "@/lib/server/ingestion";
import { prepareExecution, toExecutionResponse } from "@/lib/server/execution";
import { executionErrorResponse } from "@/lib/server/execution-response";
import { privateResponseHeaders } from "@/lib/server/ingestion-response";

export const runtime = "nodejs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = executeInputSchema.safeParse(await readBoundedJson(request));
    if (!input.success)
      throw new RequestInputError(
        "Choose a valid source, output, and request.",
        400,
      );
    const session = await getReviewerSession(input.data.source === "demo");
    const run = await prepareExecution(input.data, session.id);
    return NextResponse.json(toExecutionResponse(run), {
      headers: privateResponseHeaders,
    });
  } catch (error) {
    return executionErrorResponse(error);
  }
}
