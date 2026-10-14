import { NextResponse } from "next/server";
import { z } from "zod";
import { evaluateRelease } from "@/lib/execution/policy";
import { RequestInputError } from "@/lib/http/json";
import { getReviewerSession } from "@/lib/server/ingestion";
import { readRun, readRunOutput } from "@/lib/server/execution";
import { executionErrorResponse } from "@/lib/server/execution-response";
import { privateResponseHeaders } from "@/lib/server/ingestion-response";

export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request) {
  try {
    const query = z
      .object({ run: z.uuid(), download: z.literal("1").optional() })
      .strict()
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success)
      throw new RequestInputError(
        "Choose a valid output from this session.",
        400,
      );
    const session = await getReviewerSession();
    const run = await readRun(session.id, query.data.run);
    if (run.status === "rejected")
      throw new RequestInputError("The reviewer rejected this output.", 403);
    if (query.data.download) {
      const decision = evaluateRelease(run, Math.floor(Date.now() / 1000));
      if (!decision.allowed || run.status !== "released")
        throw new RequestInputError(
          "Approve and release this output before downloading it.",
          403,
        );
    }
    const bytes = await readRunOutput(run);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...privateResponseHeaders,
        "Content-Type": "image/webp",
        "Content-Length": String(bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Disposition": `${query.data.download ? "attachment" : "inline"}; filename="${run.recipe}.webp"`,
      },
    });
  } catch (error) {
    return executionErrorResponse(error);
  }
}
