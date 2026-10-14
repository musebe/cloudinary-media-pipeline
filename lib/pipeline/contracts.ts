import { z } from "zod";

export const pipelineRecipeSchema = z.enum(["storefront", "social", "catalog"]);
export type PipelineRecipe = z.infer<typeof pipelineRecipeSchema>;

export const recipeMetadata = [
  {
    id: "storefront",
    label: "Storefront image",
    description: "A square product image that preserves the full subject.",
    width: 1200,
    height: 1200,
    fit: "pad",
  },
  {
    id: "social",
    label: "Social preview",
    description:
      "A landscape preview with a fixed crop to inspect before release.",
    width: 1200,
    height: 630,
    fit: "fill",
  },
  {
    id: "catalog",
    label: "Catalog image",
    description: "A larger square image that preserves the full subject.",
    width: 1600,
    height: 1600,
    fit: "pad",
  },
] as const satisfies ReadonlyArray<{
  id: PipelineRecipe;
  label: string;
  description: string;
  width: number;
  height: number;
  fit: "pad" | "fill";
}>;

export const pipelineRequestSchema = z
  .object({
    recipe: pipelineRecipeSchema,
    prompt: z
      .string()
      .min(1, "Add a request to preview.")
      .max(500, "Keep the request to 500 characters or fewer.")
      .refine(
        (prompt) => prompt.trim().length > 0,
        "Add a request to preview.",
      ),
  })
  .strict();

export type PipelineRequest = z.infer<typeof pipelineRequestSchema>;

export const pipelineNodeIdSchema = z.enum([
  "ingest",
  "inspect",
  "transform",
  "policy",
  "deliver",
]);
export type PipelineNodeId = z.infer<typeof pipelineNodeIdSchema>;

export const pipelineToolSchema = z.enum([
  "cloudinary.upload.sign",
  "cloudinary.admin.read",
  "cloudinary.analyze.visual",
  "cloudinary.transform.url",
  "application.policy.evaluate",
  "cloudinary.delivery.sign",
]);
export type PipelineTool = z.infer<typeof pipelineToolSchema>;

export const pipelineArtifactKindSchema = z.enum([
  "source_image",
  "verified_asset",
  "inspection_evidence",
  "transformed_derivative",
  "policy_decision",
  "delivery_manifest",
]);
export type PipelineArtifactKind = z.infer<typeof pipelineArtifactKindSchema>;

const artifactInputSchema = z
  .object({
    kind: pipelineArtifactKindSchema,
    from: z.enum(["request", ...pipelineNodeIdSchema.options]),
  })
  .strict();

export const pipelineNodeSchema = z
  .object({
    id: pipelineNodeIdSchema,
    label: z.string().min(1).max(100),
    dependsOn: z.array(pipelineNodeIdSchema).max(5),
    tools: z.array(pipelineToolSchema).min(1).max(3),
    inputs: z.array(artifactInputSchema).min(1).max(3),
    output: pipelineArtifactKindSchema,
  })
  .strict();

export type PipelineNode = z.infer<typeof pipelineNodeSchema>;

// This schema checks the payload shape. validatePipelinePlan also checks the DAG
// and each stage's capability and artifact contracts before a plan is displayed.
export const pipelinePlanSchema = z
  .object({
    schemaVersion: z.literal("media-pipeline.preview.v1"),
    mode: z.literal("preview"),
    executionKind: z.literal("deterministic-workflow"),
    promptHandling: z.literal("display-only"),
    recipe: pipelineRecipeSchema,
    prompt: pipelineRequestSchema.shape.prompt,
    output: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        fit: z.enum(["pad", "fill"]),
        format: z.literal("webp"),
      })
      .strict(),
    paidCalls: z.literal(0),
    operationsPerformed: z.literal(0),
    nodes: z.array(pipelineNodeSchema).min(1).max(10),
    notes: z.array(z.string().min(1).max(300)).min(1).max(5),
  })
  .strict();

export type PipelinePlan = z.infer<typeof pipelinePlanSchema>;
