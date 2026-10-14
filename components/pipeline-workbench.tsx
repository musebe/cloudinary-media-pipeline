"use client";

import { useState, useTransition, type FormEvent } from "react";
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
  const [isPending, startTransition] = useTransition();
  const selectedRecipe = recipeMetadata.find((item) => item.id === recipe)!;

  function updateRecipe(value: string) {
    const selected = pipelineRecipeSchema.safeParse(value);
    if (!selected.success) return;
    setRecipe(selected.data);
    setPlan(null);
    setError(null);
  }

  function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPlan(null);
    startTransition(async () => {
      try {
        setPlan(await requestPlan(recipe, prompt));
      } catch (failure) {
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
                  <AlertTitle>Preview not prepared</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                size="lg"
                className="min-h-11 w-full"
                disabled={isPending || !prompt.trim()}
              >
                {isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <GitBranch data-icon="inline-start" aria-hidden="true" />
                )}
                {isPending ? "Preparing plan…" : "Preview workflow"}
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
              No credentials needed for this preview. Live operations remain
              disabled.
            </p>
          </div>
          <Badge variant="outline">
            {configuration.cloudinary.configured
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
            {plan ? "5 planned stages" : "No plan yet"}
          </Badge>
        </div>
        <Alert role="note">
          <Info aria-hidden="true" />
          <AlertTitle>Plan it before running it</AlertTitle>
          <AlertDescription>
            This is a deterministic workflow preview, not an AI agent run. No
            media or delivery URL is created.
          </AlertDescription>
        </Alert>
        <p className="sr-only" role="status">
          {isPending
            ? "Preparing workflow plan."
            : plan
              ? "Workflow plan ready. Five stages planned; no operations performed."
              : "No workflow plan prepared."}
        </p>
        {plan ? (
          <PipelinePlanView plan={plan} />
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
