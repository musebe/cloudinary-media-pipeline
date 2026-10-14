import { NextResponse } from "next/server";
import { reviewInputSchema } from "@/lib/execution/requests";
import { readBoundedJson, RequestInputError } from "@/lib/http/json";
import { assertSameOrigin, getReviewerSession } from "@/lib/server/ingestion";
import { reviewExecution, toExecutionResponse } from "@/lib/server/execution";
import { executionErrorResponse } from "@/lib/server/execution-response";
import { privateResponseHeaders } from "@/lib/server/ingestion-response";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = reviewInputSchema.safeParse(
      await readBoundedJson(request, 2048),
    );
    if (!input.success)
      throw new RequestInputError(
        "Submit all required review checks for the current run.",
        400,
      );
    const session = await getReviewerSession();
    return NextResponse.json(
      toExecutionResponse(await reviewExecution(input.data, session.id)),
      { headers: privateResponseHeaders },
    );
  } catch (error) {
    return executionErrorResponse(error);
  }
}
