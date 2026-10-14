import { NextResponse } from "next/server";
import { ingestionSignInputSchema } from "@/lib/ingestion/contracts";
import { readBoundedJson, RequestInputError } from "@/lib/http/json";
import {
  assertSameOrigin,
  requireIngestionEnabled,
  getReviewerSession,
  createSignedUpload,
} from "@/lib/server/ingestion";
import {
  ingestionErrorResponse,
  privateResponseHeaders,
} from "@/lib/server/ingestion-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireIngestionEnabled();
    const parsed = ingestionSignInputSchema.safeParse(
      await readBoundedJson(request),
    );
    if (!parsed.success)
      throw new RequestInputError(
        "Choose a JPEG, PNG, or WebP under 4 MB and enter a valid request.",
        400,
      );
    const session = await getReviewerSession(true);
    return NextResponse.json(createSignedUpload(parsed.data, session.id), {
      headers: privateResponseHeaders,
    });
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
