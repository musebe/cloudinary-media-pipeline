"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { ArrowRight, GitBranch, Info, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PipelinePlanView } from "@/components/pipeline-plan-view";
import type { ConfigurationStatus } from "@/lib/configuration";
import {
  pipelineRecipeSchema,
  recipeMetadata,
  type PipelinePlan,
  type PipelineRecipe,
} from "@/lib/pipeline/contracts";
import { validatePipelinePlan } from "@/lib/pipeline/planner";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { SourceImage } from "@/components/source-image";
import { bundledDemo, demoImageSchema, type DemoImage } from "@/lib/demo";
import { uploadAndVerify, validateSelectedImage } from "@/lib/client/ingestion";

const exampleRequests: Record<PipelineRecipe, string> = {
  storefront:
    "Prepare this product image for the storefront. Keep the full product visible and require approval before release.",
  social:
    "Prepare a landscape social preview. Check the crop and send the image for approval before release.",
  catalog:
    "Prepare a high-resolution square catalog image. Preserve the full product and require approval before release.",
};

async function requestPlan(recipe: PipelineRecipe, prompt: string) {
  const response = await fetch("/api/pipelines/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe, prompt }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      "The preview service returned an unexpected response. Please try again.",
    );
  }
  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      "The plan could not be prepared. Check your request and try again.",
    );
  }
  if (!payload || typeof payload !== "object" || !("plan" in payload)) {
    throw new Error("The preview service returned an incomplete plan.");
  }
  return validatePipelinePlan(payload.plan);
}

export function PipelineWorkbench({
  configuration,
}: {
  configuration: ConfigurationStatus;
}) {
  const [recipe, setRecipe] = useState<PipelineRecipe>("storefront");
  const [prompt, setPrompt] = useState(exampleRequests.storefront);
  const [plan, setPlan] = useState<PipelinePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [image, setImage] = useState<DemoImage>(bundledDemo);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedRecipe = recipeMetadata.find((item) => item.id === recipe)!;

  function loadSavedDemo() {
    setError(null);
    setStatusMessage("Loading saved demo…");
    startTransition(async () => {
      try {
        const response = await fetch(`/api/demo?recipe=${recipe}`, {
          signal: AbortSignal.timeout(10000),
        });
        if (
          !response.ok ||
          !response.headers.get("content-type")?.includes("application/json")
        )
          throw new Error("The saved demo could not be loaded.");
        const result = z
          .object({
            image: demoImageSchema,
            plan: z.unknown(),
            noNewMediaOperations: z.literal(true),
          })
          .strict()
          .parse(await response.json());
        setImage(result.image);
        const nextPlan = validatePipelinePlan(result.plan);
        setPlan(nextPlan);
        setPrompt(nextPlan.prompt);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setStatusMessage(
          "Saved demo loaded. No new images generated or uploaded.",
        );
      } catch {
        setError(
          "The saved demo could not be loaded. The bundled image is still available.",
        );
        setStatusMessage("");
      }
    });
  }

  function updateRecipe(value: string) {
    const selected = pipelineRecipeSchema.safeParse(value);
    if (!selected.success) return;
    setRecipe(selected.data);
    setPlan(null);
    setStatusMessage("");
    setError(null);
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPlan(null);
    startTransition(async () => {
      try {
        if (file) {
          const input = await validateSelectedImage(
            file,
            { recipe, prompt },
            configuration.maxUploadBytes,
          );
          const result = await uploadAndVerify(file, input, setStatusMessage);
          setImage({
            imageUrl: result.imageUrl,
            alt: "Original image uploaded for review",
            width: result.asset.width,
            height: result.asset.height,
            asset: result.asset,
            source: "upload",
          });
          setPlan(result.plan);
          setFile(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          setStatusMessage(
            "Upload verified. Analysis, formatting, and approval have not run.",
          );
        } else {
          setPlan(await requestPlan(recipe, prompt));
          setStatusMessage("");
        }
      } catch (failure) {
        setStatusMessage("");
        setError(
          failure instanceof Error
            ? failure.message
            : "The preview could not be prepared.",
        );
      }
    });
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)]">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Prepare an image workflow</h2>
          </CardTitle>
          <CardDescription>
            Select the output, then preview the required handoffs.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="pipeline-request" onSubmit={submitRequest}>
            <FieldGroup>
              <Field>
                <SourceImage key={image.imageUrl} image={image} />
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 w-full"
                  disabled={isPending}
                  onClick={loadSavedDemo}
                >
                  Load saved demo
                </Button>
                <FieldDescription>
                  No upload or image generation needed.
                </FieldDescription>
              </Field>
              <Field
                data-disabled={
                  !configuration.capabilities.liveIngestion ||
                  isPending ||
                  undefined
                }
              >
                <FieldLabel htmlFor="source-file">
                  Or choose your own image
                </FieldLabel>
                <Input
                  ref={fileInputRef}
                  id="source-file"
                  type="file"
                  className="min-h-11"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={
                    !configuration.capabilities.liveIngestion || isPending
                  }
                  onChange={(event) => {
                    setFile(event.target.files?.[0] ?? null);
                    setPlan(null);
                    setError(null);
                    setStatusMessage("");
                  }}
                  aria-describedby="upload-help"
                />
                <FieldDescription id="upload-help">
                  JPEG, PNG, or WebP · up to{" "}
                  {(configuration.maxUploadBytes / 1000000).toFixed(1)} MB.{" "}
                  {configuration.capabilities.liveIngestion
                    ? "Uploaded originals stay authenticated."
                    : "Uploads are disabled; the saved demo still works."}
                </FieldDescription>
              </Field>
              <Field data-disabled={isPending || undefined}>
                <FieldTitle id="output-label">Image output</FieldTitle>
                <ToggleGroup
                  type="single"
                  value={recipe}
                  onValueChange={updateRecipe}
                  variant="outline"
                  spacing={2}
                  disabled={isPending}
                  aria-labelledby="output-label"
                  className="w-full flex-wrap justify-start"
                >
                  {recipeMetadata.map((item) => (
                    <ToggleGroupItem
                      key={item.id}
                      value={item.id}
                      className="min-h-11 px-3"
                      aria-label={item.label}
                    >
                      {item.label.replace(" image", "")}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>
                  {selectedRecipe.width} × {selectedRecipe.height} · WebP
                  <br />
                  {selectedRecipe.description}
                </FieldDescription>
              </Field>

              <Field data-disabled={isPending || undefined}>
                <FieldLabel htmlFor="media-request">Your request</FieldLabel>
                <Textarea
                  id="media-request"
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value);
                    setPlan(null);
                    setError(null);
                  }}
                  rows={5}
                  className="min-h-32 resize-y"
                  maxLength={500}
                  required
                  disabled={isPending}
                  aria-describedby="request-help"
                />
                <FieldDescription id="request-help">
                  The selected output controls this preview. Request text cannot
                  add tools or bypass approval.
                </FieldDescription>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    type="button"
                    disabled={isPending}
                    className="min-h-11"
                    onClick={() => {
                      setPrompt(exampleRequests[recipe]);
                      setPlan(null);
                      setError(null);
                    }}
                  >
                    Use example request
                  </Button>
                  <span
                    className="text-xs text-muted-foreground"
                    aria-label={prompt.length + " of 500 characters"}
                  >
                    {prompt.length}/500
                  </span>
                </div>
              </Field>

              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>
                    {file ? "Image not verified" : "Preview not prepared"}
                  </AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="min-h-11 w-full"
                disabled={
                  isPending ||
                  !prompt.trim() ||
                  Boolean(file && !configuration.capabilities.liveIngestion)
                }
              >
                {isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <GitBranch data-icon="inline-start" aria-hidden="true" />
                )}
                {isPending
                  ? "Working…"
                  : file
                    ? "Upload & verify image"
                    : "Preview workflow"}
                {!isPending ? (
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                ) : null}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="flex-col items-start gap-3">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <p>
              Saved demos create no new media. Upload verification is not
              approval; AI analysis stays off.
            </p>
          </div>
          <Badge variant="outline">
            {image.asset?.status === "verified"
              ? "Asset verification available"
              : configuration.cloudinary.configured
                ? "Cloudinary keys supplied · not verified"
                : "Cloudinary not configured"}
          </Badge>
        </CardFooter>
      </Card>

      <section
        className="flex min-w-0 flex-col gap-4"
        aria-labelledby="workflow-title"
        aria-busy={isPending}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="workflow-title"
            className="text-lg font-semibold tracking-tight"
          >
            Workflow preview
          </h2>
          <Badge variant="secondary">
            {plan
              ? image.asset
                ? "Source verified · 4 stages pending"
                : "5 planned stages"
              : "No plan yet"}
          </Badge>
        </div>
        <Alert role="note">
          <Info aria-hidden="true" />
          <AlertTitle>Plan it before running it</AlertTitle>
          <AlertDescription>
            {image.asset
              ? "The original has verification evidence. Analysis, transformation, approval, and final release are not implemented yet."
              : "This is a deterministic workflow preview, not an AI agent run. Load the saved image to inspect its source and planned handoffs."}
          </AlertDescription>
        </Alert>
        <p
          className="text-xs leading-relaxed text-muted-foreground"
          role="status"
        >
          {statusMessage ||
            (isPending
              ? "Preparing workflow plan."
              : plan
                ? "Workflow plan ready. Previewing it performs no media operations."
                : "")}
        </p>
        {plan ? (
          <PipelinePlanView plan={plan} assetVerified={Boolean(image.asset)} />
        ) : (
          <Empty className="min-h-96 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitBranch aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Your workflow starts here</EmptyTitle>
              <EmptyDescription>
                Preview a request to see each stage, its inputs, and the checks
                that must pass before delivery.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
}
