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
import { requestExecutionAction, readApiJson } from "@/lib/client/execution";
import {
  executionResponseSchema,
  type ExecutionResponse,
  type DeliveryManifest,
} from "@/lib/execution/requests";
import { RunResult, type ReviewChecks } from "@/components/run-result";

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
  const [execution, setExecution] = useState<ExecutionResponse | null>(null);
  const [manifest, setManifest] = useState<DeliveryManifest | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const selectedRecipe = recipeMetadata.find((item) => item.id === recipe)!;

  function previewOnly() {
    setError(null);
    clearRun();
    startTransition(async () => {
      try {
        setPlan(await requestPlan(recipe, prompt));
        setStatusMessage("Workflow plan ready. No media operations performed.");
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "The preview could not be prepared.",
        );
      }
    });
  }

  function clearRun() {
    setExecution(null);
    setManifest(null);
  }

  async function prepareOutput(source: "demo" | "upload", assetId?: string) {
    const { result } = await requestExecutionAction("execute", {
      source,
      recipe,
      prompt,
      ...(source === "upload" ? { assetId } : {}),
    });
    setExecution(result);
    setManifest(null);
    if (source === "demo")
      setImage({
        imageUrl: bundledDemo.imageUrl,
        alt: bundledDemo.alt,
        asset: result.run.asset,
        width: result.run.asset.width,
        height: result.run.asset.height,
        source: "cloudinary-demo",
      });
    setStatusMessage(
      source === "demo"
        ? "Saved output ready for review. No new images or transformations created."
        : "Cloudinary output verified. Review it before release.",
    );
  }

  function runAction(
    action: "review" | "release" | "restart",
    decision?: "approve" | "reject",
    checks?: ReviewChecks,
  ) {
    if (!execution) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await requestExecutionAction(action, {
          runId: execution.run.id,
          ...(action === "review" ? { decision, checks } : {}),
        });
        setExecution(response.result);
        setManifest(response.manifest);
        setStatusMessage(
          action === "release"
            ? "Delivery verified. Your approved WebP is ready to download."
            : action === "restart"
              ? "New review started. Previous approval was cleared."
              : decision === "reject"
                ? "Output rejected. Release stays locked."
                : "Approval saved. Verify delivery to release the output.",
        );
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "The request did not complete.",
        );
      }
    });
  }

  function resumeReview() {
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/pipelines/current", {
          signal: AbortSignal.timeout(10_000),
        });
        const restored = executionResponseSchema.parse(
          await readApiJson(response),
        );
        setExecution(restored);
        setManifest(null);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setRecipe(restored.run.recipe);
        setPrompt(restored.run.prompt);
        setPlan(await requestPlan(restored.run.recipe, restored.run.prompt));
        setImage({
          imageUrl:
            restored.run.kind === "demo"
              ? bundledDemo.imageUrl
              : `/api/ingestions/image?asset=${restored.run.asset.assetId}`,
          asset: restored.run.asset,
          source: restored.run.kind === "demo" ? "cloudinary-demo" : "upload",
          width: restored.run.asset.width,
          height: restored.run.asset.height,
          alt:
            restored.run.kind === "demo"
              ? bundledDemo.alt
              : "Uploaded source image",
        });
        if (restored.run.status === "released") {
          const released = await requestExecutionAction("release", {
            runId: restored.run.id,
          });
          setExecution(released.result);
          setManifest(released.manifest);
        }
        setStatusMessage(
          "Previous run restored from this browser's review session.",
        );
      } catch (failure) {
        setError(
          failure instanceof Error
            ? failure.message
            : "There is no previous run to restore.",
        );
      }
    });
  }

  function loadSavedDemo() {
    setError(null);
    clearRun();
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
        setImage({ ...result.image, imageUrl: bundledDemo.imageUrl });
        const nextPlan = validatePipelinePlan(result.plan);
        setPlan(await requestPlan(nextPlan.recipe, prompt));
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setStatusMessage(
          "Saved demo loaded. No new images generated or uploaded.",
        );
        if (configuration.capabilities.savedExecution)
          await prepareOutput("demo");
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
    clearRun();
    setStatusMessage("");
    setError(null);
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPlan(null);
    clearRun();
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
          setStatusMessage("Upload verified. Preparing your fixed output…");
          await prepareOutput("upload", result.asset.assetId);
        } else {
          setPlan(await requestPlan(recipe, prompt));
          if (configuration.capabilities.savedExecution)
            await prepareOutput(
              image.source === "upload" ? "upload" : "demo",
              image.asset?.assetId,
            );
          else
            setStatusMessage(
              "Plan ready. Configure the reviewer-session secret to run the saved demo.",
            );
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
            Choose an output, inspect the result, then approve or reject it.
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
                  Three verified outputs. No upload or generation needed.
                </FieldDescription>
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  disabled={
                    isPending || !configuration.capabilities.savedExecution
                  }
                  onClick={resumeReview}
                >
                  Resume previous review
                </Button>
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
                    clearRun();
                    setError(null);
                    setStatusMessage("");
                  }}
                  aria-describedby="upload-help"
                />
                <FieldDescription id="upload-help">
                  JPEG, PNG, or WebP · up to{" "}
                  {(configuration.maxUploadBytes / 1000000).toFixed(1)} MB.{" "}
                  {configuration.capabilities.liveIngestion
                    ? "One standard Cloudinary transformation per prepared output."
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
                    clearRun();
                    setError(null);
                  }}
                  rows={3}
                  className="min-h-24 resize-y"
                  maxLength={500}
                  required
                  disabled={isPending}
                  aria-describedby="request-help"
                />
                <FieldDescription id="request-help">
                  The selected output controls the workflow. Request text cannot
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
                      clearRun();
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
                    {file ? "Image not verified" : "Request not completed"}
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
                    ? "Upload & prepare output"
                    : configuration.capabilities.savedExecution
                      ? "Prepare output"
                      : "Preview workflow"}
                {!isPending ? (
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                ) : null}
              </Button>
              {configuration.capabilities.savedExecution ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full"
                  disabled={isPending || !prompt.trim()}
                  onClick={previewOnly}
                >
                  Preview workflow
                </Button>
              ) : null}
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
              Saved runs create no new media. Metadata inspection is not content
              moderation. Paid AI analysis stays off.
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
            Output & release
          </h2>
          <Badge variant="secondary">
            {execution
              ? execution.run.status === "released"
                ? "Complete"
                : "Release gate active"
              : plan
                ? image.asset
                  ? "Source verified · 4 stages pending"
                  : "5 planned stages"
                : "No plan yet"}
          </Badge>
        </div>
        {!execution ? (
          <Alert role="note">
            <Info aria-hidden="true" />
            <AlertTitle>Try it without generating an image</AlertTitle>
            <AlertDescription>
              Load the saved demo to compare the original with a verified
              Cloudinary output. Every release needs your approval. This is a
              deterministic workflow, not an AI agent run.
            </AlertDescription>
          </Alert>
        ) : null}
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
        {execution ? (
          <RunResult
            key={execution.run.id}
            result={execution}
            manifest={manifest}
            pending={isPending}
            onReview={(decision, checks) =>
              runAction("review", decision, checks)
            }
            onRelease={() => runAction("release")}
            onRestart={() => runAction("restart")}
          />
        ) : null}
        {plan && execution ? (
          <details>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              View the planned handoffs
            </summary>
            <PipelinePlanView
              plan={plan}
              assetVerified={Boolean(image.asset)}
            />
          </details>
        ) : plan ? (
          <PipelinePlanView plan={plan} assetVerified={Boolean(image.asset)} />
        ) : (
          <Empty className="min-h-96 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <GitBranch aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Your workflow starts here</EmptyTitle>
              <EmptyDescription>
                Load the saved demo or prepare an output to inspect the result
                and its release checks.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
    </div>
  );
}
