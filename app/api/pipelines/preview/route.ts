import { NextResponse } from "next/server";
import { createPipelinePlan } from "@/lib/pipeline/planner";
import { pipelineRequestSchema } from "@/lib/pipeline/contracts";
import { readBoundedJson, RequestInputError } from "@/lib/http/json";

export const runtime = "nodejs";
const responseHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const parsed = pipelineRequestSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Choose a supported output and enter a request of 1–500 characters.",
        },
        { status: 400, headers: responseHeaders },
      );
    }
    return NextResponse.json(
      { plan: createPipelinePlan(parsed.data) },
      { headers: responseHeaders },
    );
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status, headers: responseHeaders },
      );
    }
    return NextResponse.json(
      { error: "The workflow plan could not be prepared." },
      { status: 500, headers: responseHeaders },
    );
  }
}
