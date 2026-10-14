import { NextResponse } from "next/server";
import { ingestionFinalizeInputSchema } from "@/lib/ingestion/contracts";
import { verifyUploadedAsset } from "@/lib/ingestion/verify";
import { readBoundedJson, RequestInputError } from "@/lib/http/json";
import { getAssetById } from "@/lib/server/cloudinary";
import {
  assertSameOrigin,
  requireIngestionEnabled,
  getReviewerSession,
  readUploadIntent,
  storeReviewReceipt,
} from "@/lib/server/ingestion";
import { createPipelinePlan } from "@/lib/pipeline/planner";
import {
  ingestionErrorResponse,
  privateResponseHeaders,
} from "@/lib/server/ingestion-response";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    requireIngestionEnabled();
    const parsed = ingestionFinalizeInputSchema.safeParse(
      await readBoundedJson(request, 6144),
    );
    if (!parsed.success)
      throw new RequestInputError("The upload result is invalid.", 400);
    const session = await getReviewerSession();
    const intent = readUploadIntent(parsed.data.ticket, session.id);
    const result = await getAssetById(parsed.data.assetId);
    const asset = verifyUploadedAsset(result, intent, parsed.data.assetId);
    await storeReviewReceipt(asset, session.id);
    return NextResponse.json(
      {
        asset,
        reviewImageUrl: `/api/ingestions/image?asset=${asset.assetId}`,
        plan: createPipelinePlan({
          recipe: asset.recipe,
          prompt: asset.prompt,
        }),
      },
      { headers: privateResponseHeaders },
    );
  } catch (error) {
    return ingestionErrorResponse(error);
  }
}
