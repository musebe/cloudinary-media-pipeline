import { NextResponse } from "next/server";
import {
  getReviewerSession,
  readCurrentReviewImage,
  getReviewerImageUrl,
} from "@/lib/server/ingestion";
import { RequestInputError } from "@/lib/http/json";
import { ingestionAssetIdSchema } from "@/lib/ingestion/contracts";
import {
  ingestionErrorResponse,
  privateResponseHeaders,
} from "@/lib/server/ingestion-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const assetId = ingestionAssetIdSchema.safeParse(
      new URL(request.url).searchParams.get("asset"),
    );
    if (!assetId.success)
      throw new RequestInputError("A valid asset ID is required.", 400);
    const session = await getReviewerSession();
    const asset = await readCurrentReviewImage(session.id, assetId.data);
    const response = NextResponse.redirect(getReviewerImageUrl(asset), 307);
    response.headers.set(
      "Cache-Control",
      privateResponseHeaders["Cache-Control"],
    );
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
