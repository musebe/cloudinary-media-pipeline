import { NextResponse } from "next/server";
import { pipelineRecipeSchema } from "@/lib/pipeline/contracts";
import { createPipelinePlan } from "@/lib/pipeline/planner";
import { getSavedDemo } from "@/lib/server/saved-demo";

export const runtime = "nodejs";

export function GET(request: Request) {
  const recipe = pipelineRecipeSchema.safeParse(
    new URL(request.url).searchParams.get("recipe") ?? "storefront",
  );
  if (!recipe.success)
    return NextResponse.json(
      { error: "Choose a supported output." },
      { status: 400 },
    );
  return NextResponse.json(
    {
      image: getSavedDemo(),
      plan: createPipelinePlan({
        recipe: recipe.data,
        prompt:
          "Prepare the saved product-image demo for this output and require approval before release.",
      }),
      noNewMediaOperations: true,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
