import { NextResponse } from "next/server";
import { getReviewerSession } from "@/lib/server/ingestion";
import { readRun, toExecutionResponse } from "@/lib/server/execution";
import { executionErrorResponse } from "@/lib/server/execution-response";
import { privateResponseHeaders } from "@/lib/server/ingestion-response";

export const runtime = "nodejs";
export async function GET() {
  try {
    const session = await getReviewerSession();
    return NextResponse.json(toExecutionResponse(await readRun(session.id)), {
      headers: privateResponseHeaders,
    });
  } catch (error) {
    return executionErrorResponse(error);
  }
}
