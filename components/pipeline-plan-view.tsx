import {
  CloudUpload,
  Eye,
  Scan,
  ShieldCheck,
  Send,
  ArrowDown,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  PipelineArtifactKind,
  PipelineNode,
  PipelineNodeId,
  PipelinePlan,
} from "@/lib/pipeline/contracts";

const nodeIcons: Record<PipelineNodeId, LucideIcon> = {
  ingest: CloudUpload,
  inspect: Eye,
  transform: Scan,
  policy: ShieldCheck,
  deliver: Send,
};

const artifactLabels: Record<PipelineArtifactKind, string> = {
  source_image: "Source image",
  verified_asset: "Verified Cloudinary asset",
  inspection_evidence: "Inspection evidence",
  transformed_derivative: "Verified derivative",
  policy_decision: "Policy decision",
  delivery_manifest: "Delivery manifest",
};

function PlannedStage({
  node,
  verified = false,
}: {
  node: PipelineNode;
  verified?: boolean;
}) {
  const Icon = nodeIcons[node.id];
  return (
    <Card size="sm" data-testid={"stage-" + node.id} className="min-w-0">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <CardTitle>
              <h3>{node.label}</h3>
            </CardTitle>
          </div>
          <Badge variant={verified ? "secondary" : "outline"}>
            {verified ? "Verified" : "Planned"}
          </Badge>
        </div>
        <CardDescription>
          {node.dependsOn.length
            ? "Waits for: " + node.dependsOn.join(" + ")
            : "Starts with the source image"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Required output:{" "}
          <span className="text-foreground">{artifactLabels[node.output]}</span>
        </p>
      </CardContent>
      <CardFooter>
        <details className="group w-full text-xs">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Inputs and allowed tools
            <ChevronDown
              className="size-4 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="flex flex-col gap-2 pt-2 text-muted-foreground">
            <ul className="flex list-inside list-disc flex-col gap-1">
              {node.inputs.map((input) => (
                <li key={input.from + ":" + input.kind}>
                  {artifactLabels[input.kind]} from {input.from}
                </li>
              ))}
            </ul>
            <p className="break-all font-mono leading-relaxed">
              {node.tools.join(" · ")}
            </p>
          </div>
        </details>
      </CardFooter>
    </Card>
  );
}

function DependencyArrow() {
  return (
    <div className="flex justify-center py-1">
      <ArrowDown className="size-4 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export function PipelinePlanView({
  plan,
  assetVerified = false,
}: {
  plan: PipelinePlan;
  assetVerified?: boolean;
}) {
  const byId = new Map(plan.nodes.map((node) => [node.id, node]));
  return (
    <div className="flex flex-col gap-3" data-testid="pipeline-plan">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
        <p>
          {plan.output.width} × {plan.output.height} · WebP ·{" "}
          {plan.output.fit === "pad"
            ? "Preserve full image"
            : "Crop requires review"}
        </p>
        <span className="text-xs text-muted-foreground">
          {assetVerified
            ? "Ingestion only · no final release"
            : "No operations performed"}
        </span>
      </div>
      <div>
        <PlannedStage node={byId.get("ingest")!} verified={assetVerified} />
        <DependencyArrow />
        <PlannedStage node={byId.get("inspect")!} />
        <DependencyArrow />
        <div className="grid gap-3 sm:grid-cols-2">
          <PlannedStage node={byId.get("transform")!} />
          <PlannedStage node={byId.get("policy")!} />
        </div>
        <p className="py-2 text-center text-xs text-muted-foreground">
          Both branches must complete before release.
        </p>
        <PlannedStage node={byId.get("deliver")!} />
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Approval and actual delivery verification are required by the planned
        release gate. Nothing has been approved or delivered.
      </p>
    </div>
  );
}
