import { NextResponse } from "next/server";
import { z } from "zod";
import { getReviewerSession } from "@/lib/server/ingestion";
import { readRun, toExecutionResponse } from "@/lib/server/execution";
import { executionErrorResponse } from "@/lib/server/execution-response";
import { RequestInputError } from "@/lib/http/json";
import { privateResponseHeaders } from "@/lib/server/ingestion-response";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const input = z
      .object({ run: z.uuid() })
      .strict()
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!input.success) throw new RequestInputError("Select a valid run.", 400);
    const session = await getReviewerSession();
    return NextResponse.json(
      toExecutionResponse(await readRun(session.id, input.data.run)),
      {
        headers: {
          ...privateResponseHeaders,
          "Content-Disposition": 'attachment; filename="run-evidence.json"',
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    return executionErrorResponse(error);
  }
}
