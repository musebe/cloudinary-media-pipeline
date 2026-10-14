import {
  pipelinePlanSchema,
  pipelineRequestSchema,
  recipeMetadata,
  type PipelineNode,
  type PipelineNodeId,
  type PipelinePlan,
} from "./contracts";

const stageDefinitions: ReadonlyArray<PipelineNode> = [
  {
    id: "ingest",
    label: "Upload and verify",
    dependsOn: [],
    tools: ["cloudinary.upload.sign", "cloudinary.admin.read"],
    inputs: [{ kind: "source_image", from: "request" }],
    output: "verified_asset",
  },
  {
    id: "inspect",
    label: "Inspect image metadata",
    dependsOn: ["ingest"],
    tools: ["application.metadata.inspect"],
    inputs: [{ kind: "verified_asset", from: "ingest" }],
    output: "inspection_evidence",
  },
  {
    id: "transform",
    label: "Prepare the fixed format",
    dependsOn: ["inspect"],
    tools: ["cloudinary.transform.eager", "application.delivery.verify"],
    inputs: [
      { kind: "verified_asset", from: "ingest" },
      { kind: "inspection_evidence", from: "inspect" },
    ],
    output: "transformed_derivative",
  },
  {
    id: "policy",
    label: "Check release requirements",
    dependsOn: ["inspect"],
    tools: ["application.policy.evaluate"],
    inputs: [{ kind: "inspection_evidence", from: "inspect" }],
    output: "policy_decision",
  },
  {
    id: "deliver",
    label: "Release only after both gates",
    dependsOn: ["transform", "policy"],
    tools: ["cloudinary.delivery.sign"],
    inputs: [
      { kind: "transformed_derivative", from: "transform" },
      { kind: "policy_decision", from: "policy" },
    ],
    output: "delivery_manifest",
  },
];

function sameValues(actual: readonly string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    expected.every((value) => actual.includes(value))
  );
}

function assertAcyclic(nodes: readonly PipelineNode[]) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  function visit(id: PipelineNodeId, path: readonly PipelineNodeId[]): void {
    if (path.includes(id)) throw new Error("The pipeline contains a cycle.");
    const node = nodesById.get(id);
    if (!node) throw new Error("The pipeline references a missing dependency.");
    node.dependsOn.forEach((dependency) => visit(dependency, [...path, id]));
  }

  nodes.forEach((node) => visit(node.id, []));
}

function assertStageContracts(nodes: readonly PipelineNode[]) {
  if (
    !sameValues(
      nodes.map((node) => node.id),
      stageDefinitions.map((node) => node.id),
    )
  ) {
    throw new Error(
      "The pipeline must include every allowlisted stage exactly once.",
    );
  }

  nodes.forEach((node) => {
    const expected = stageDefinitions.find((stage) => stage.id === node.id)!;
    if (!sameValues(node.dependsOn, expected.dependsOn)) {
      throw new Error("The pipeline has unsafe stage dependencies.");
    }
    if (!sameValues(node.tools, expected.tools)) {
      throw new Error("A stage requests capabilities outside its allowlist.");
    }
    const inputKey = (input: PipelineNode["inputs"][number]) =>
      `${input.from}:${input.kind}`;
    if (
      node.output !== expected.output ||
      !sameValues(node.inputs.map(inputKey), expected.inputs.map(inputKey))
    ) {
      throw new Error("The pipeline has an invalid artifact contract.");
    }
  });
}

/** Validate a declarative preview without performing any media operation. */
export function validatePipelinePlan(input: unknown): PipelinePlan {
  const plan = pipelinePlanSchema.parse(input);
  if (new Set(plan.nodes.map((node) => node.id)).size !== plan.nodes.length) {
    throw new Error("The pipeline contains duplicate stage IDs.");
  }
  assertAcyclic(plan.nodes);
  assertStageContracts(plan.nodes);

  const recipe = recipeMetadata.find(
    (candidate) => candidate.id === plan.recipe,
  )!;
  if (
    plan.output.width !== recipe.width ||
    plan.output.height !== recipe.height ||
    plan.output.fit !== recipe.fit
  ) {
    throw new Error("Output settings must match the selected recipe.");
  }
  return plan;
}

/** The recipe determines capabilities. The prompt remains untrusted display text. */
export function createPipelinePlan(input: unknown): PipelinePlan {
  const request = pipelineRequestSchema.parse(input);
  const recipe = recipeMetadata.find(
    (candidate) => candidate.id === request.recipe,
  )!;
  return validatePipelinePlan({
    schemaVersion: "media-pipeline.preview.v1",
    mode: "preview",
    executionKind: "deterministic-workflow",
    promptHandling: "display-only",
    recipe: request.recipe,
    prompt: request.prompt,
    output: {
      width: recipe.width,
      height: recipe.height,
      fit: recipe.fit,
      format: "webp",
    },
    paidCalls: 0,
    operationsPerformed: 0,
    nodes: stageDefinitions,
    notes: [
      "Local plan preview only: no uploads, analysis, transformations, or delivery have run.",
      "The request is displayed as untrusted text; it cannot add tools or change the selected recipe.",
      "These are deterministic workflow stages, not AI agents. Running the saved demo reuses verified outputs; paid analysis remains off.",
    ],
  });
}
