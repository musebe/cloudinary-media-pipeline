"use client";

import { useState } from "react";
import { CldImage } from "next-cloudinary";
import { Check, Download, ShieldCheck, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
  FieldDescription,
} from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type {
  ExecutionResponse,
  DeliveryManifest,
} from "@/lib/execution/requests";
import { recipeMetadata } from "@/lib/pipeline/contracts";
import { demoFixture } from "@/lib/demo";

export type ReviewChecks = {
  composition: boolean;
  content: boolean;
  rights: boolean;
};
const checkLabels: Record<keyof ReviewChecks, string> = {
  composition: "The product and crop look right",
  content: "The image is appropriate for this use",
  rights: "I have permission to use this image",
};

export function RunResult({
  result,
  manifest,
  pending,
  onReview,
  onRelease,
  onRestart,
}: {
  result: ExecutionResponse;
  manifest: DeliveryManifest | null;
  pending: boolean;
  onReview: (decision: "approve" | "reject", checks: ReviewChecks) => void;
  onRelease: () => void;
  onRestart: () => void;
}) {
  const [checks, setChecks] = useState<ReviewChecks>({
    composition: false,
    content: false,
    rights: false,
  });
  const [failed, setFailed] = useState(false);
  const { run, decision } = result;
  const recipe = recipeMetadata.find((item) => item.id === run.recipe)!;
  const canApprove = Object.values(checks).every(Boolean) && !failed;
  return (
    <Card data-testid="run-result">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>
            <h2>Review your output</h2>
          </CardTitle>
          <Badge
            variant={run.status === "rejected" ? "destructive" : "secondary"}
          >
            {run.status === "review"
              ? "Awaiting approval"
              : run.status === "released"
                ? "Released"
                : run.status === "approved"
                  ? "Approved · not released"
                  : "Rejected"}
          </Badge>
        </div>
        <CardDescription>
          {recipe.label} · {run.derivative.width} × {run.derivative.height} ·
          WebP · {(run.derivative.bytes / 1000).toFixed(1)} KB
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {failed || run.status === "rejected" ? (
          <Alert>
            <AlertTitle>
              {run.status === "rejected"
                ? "Output rejected"
                : "Output preview unavailable"}
            </AlertTitle>
            <AlertDescription>
              {run.status === "rejected"
                ? "Nothing will be released. Start a new review to reconsider this output."
                : "The verified output could not be displayed. Do not approve an image you cannot inspect."}
            </AlertDescription>
          </Alert>
        ) : (
          <div
            className="relative aspect-square max-h-96 overflow-hidden rounded-lg border bg-muted"
            data-testid="output-image"
          >
            <CldImage
              config={
                run.kind === "demo"
                  ? { cloud: { cloudName: demoFixture.cloudinary!.cloudName } }
                  : undefined
              }
              src={run.asset.publicId}
              version={run.asset.version}
              deliveryType="authenticated"
              format="default"
              quality="default"
              overrideSrc={result.outputImageUrl}
              unoptimized
              fill
              alt={`${recipe.label} prepared from the source image, awaiting or carrying this session's review`}
              sizes="(max-width: 1023px) 100vw, 600px"
              className="object-contain"
              referrerPolicy="no-referrer"
              onError={() => {
                setFailed(true);
                return false;
              }}
            />
          </div>
        )}
        <ol
          className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-5"
          aria-label="Execution trace"
          data-testid="execution-trace"
        >
          {[
            ["Source", "Verified"],
            ["Metadata", "Checked"],
            ["Format", "Verified"],
            [
              "Review",
              run.status === "review"
                ? "Pending"
                : run.status === "rejected"
                  ? "Rejected"
                  : "Approved",
            ],
            ["Release", run.status === "released" ? "Verified" : "Locked"],
          ].map(([label, state]) => (
            <li
              key={label}
              className="flex flex-col gap-2 rounded-lg border p-3"
            >
              <span>{label}</span>
              <strong>{state}</strong>
            </li>
          ))}
        </ol>
        {run.status === "review" ? (
          <FieldSet disabled={pending}>
            <FieldLegend variant="label">
              Check the image before approving
            </FieldLegend>
            <FieldDescription>
              Metadata checks cannot judge the image&apos;s content or usage
              rights. These checks are your review, not an AI verdict.
            </FieldDescription>
            <FieldGroup className="gap-2">
              {(Object.keys(checkLabels) as (keyof ReviewChecks)[]).map(
                (key) => (
                  <Field
                    key={key}
                    orientation="horizontal"
                    data-disabled={pending || undefined}
                    className="min-h-11"
                  >
                    <Checkbox
                      id={`review-${key}`}
                      checked={checks[key]}
                      disabled={pending}
                      onCheckedChange={(value) =>
                        setChecks((current) => ({
                          ...current,
                          [key]: value === true,
                        }))
                      }
                    />
                    <FieldLabel htmlFor={`review-${key}`}>
                      {checkLabels[key]}
                    </FieldLabel>
                  </Field>
                ),
              )}
            </FieldGroup>
          </FieldSet>
        ) : null}
        <p className="text-sm text-muted-foreground" role="status">
          {decision.reason}
        </p>
        <details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Inspect run evidence
          </summary>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <dt>Source</dt>
            <dd className="break-all font-mono">
              {run.asset.assetId} · v{run.asset.version}
            </dd>
            <dt>Derived ID</dt>
            <dd className="break-all font-mono">
              {run.derivative.derivedAssetId}
            </dd>
            <dt>Recipe</dt>
            <dd className="break-all font-mono">
              {run.derivative.transformation}
            </dd>
            <dt>SHA-256</dt>
            <dd className="break-all font-mono">{run.derivative.sha256}</dd>
            <dt>Verified</dt>
            <dd className="break-all">{run.derivative.verifiedAt}</dd>
            <dt>Inspection</dt>
            <dd>Asset metadata + human review</dd>
            <dt>Mode</dt>
            <dd>
              {run.kind === "demo"
                ? "Recorded Cloudinary outputs; bundled bytes checked now"
                : "Live Cloudinary output and delivery readback"}
            </dd>
          </dl>
        </details>
      </CardContent>
      <CardFooter className="flex-wrap gap-3">
        {run.status === "review" ? (
          <>
            <Button
              className="min-h-11"
              disabled={pending || !canApprove}
              onClick={() => onReview("approve", checks)}
            >
              <Check data-icon="inline-start" />
              Approve output
            </Button>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={pending}
              onClick={() => onReview("reject", checks)}
            >
              Reject output
            </Button>
          </>
        ) : null}
        {run.status === "approved" ? (
          <Button className="min-h-11" disabled={pending} onClick={onRelease}>
            <ShieldCheck data-icon="inline-start" />
            Verify & release
          </Button>
        ) : null}
        {run.status === "released" ? (
          <>
            <Button asChild className="min-h-11">
              <a
                href={
                  manifest?.deliveryUrl ?? `${result.outputImageUrl}&download=1`
                }
              >
                <Download data-icon="inline-start" />
                Download WebP
              </a>
            </Button>
            <Button asChild className="min-h-11" variant="outline">
              <a
                href={`/api/pipelines/audit?run=${run.id}`}
                download="delivery-manifest.json"
              >
                Download evidence
              </a>
            </Button>
          </>
        ) : null}
        {run.status !== "review" ? (
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={pending}
            onClick={onRestart}
          >
            <RotateCcw data-icon="inline-start" />
            Start new review
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}
