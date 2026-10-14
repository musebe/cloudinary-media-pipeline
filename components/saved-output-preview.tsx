"use client";

import { CldImage } from "next-cloudinary";
import savedOutputs from "@/fixtures/demo-outputs.json";
import { recipeMetadata, type PipelineRecipe } from "@/lib/pipeline/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

/** Public recorded example only: mounting never creates a run or grants approval. */
export function SavedOutputPreview({
  recipe,
  pending,
  onReview,
}: {
  recipe: PipelineRecipe;
  pending: boolean;
  onReview: () => void;
}) {
  const output = savedOutputs.outputs.find(
    (item) => item.derivative.recipe === recipe,
  )!;
  const label = recipeMetadata.find((item) => item.id === recipe)!.label;
  return (
    <Card data-testid="saved-output-preview">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{label}</CardTitle>
          <Badge variant="outline">Saved preview · not approved</Badge>
        </div>
        <CardDescription>
          {output.derivative.width} × {output.derivative.height} · WebP ·{" "}
          {(output.derivative.bytes / 1000).toFixed(1)} KB
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="relative aspect-square max-h-96 overflow-hidden rounded-lg border bg-muted">
          <CldImage
            config={{ cloud: { cloudName: savedOutputs.cloudName } }}
            src={output.derivative.source.publicId}
            version={output.derivative.source.version}
            deliveryType="authenticated"
            format="default"
            quality="default"
            overrideSrc={output.imagePath}
            unoptimized
            fill
            loading="eager"
            sizes="(max-width: 1023px) 100vw, 600px"
            className="object-contain"
            alt={`Saved ${label.toLowerCase()} showing the white sneaker with blue lining, not yet approved in this session`}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          A verified Cloudinary output, included in the project. Start a review
          to approve or reject it; nothing has been released.
        </p>
      </CardContent>
      <CardFooter>
        <Button className="min-h-11" disabled={pending} onClick={onReview}>
          Review this output
        </Button>
      </CardFooter>
    </Card>
  );
}
