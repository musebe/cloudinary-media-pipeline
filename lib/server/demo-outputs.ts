import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import recordedOutputs from "@/fixtures/demo-outputs.json";
import { demoFixture } from "@/lib/demo";
import {
  derivativeSchema,
  type VerifiedDerivative,
} from "@/lib/execution/contracts";
import type { PipelineRecipe } from "@/lib/pipeline/contracts";
import { inspectDerivativeBytes } from "@/lib/server/derivatives";

export const savedOutputs = z
  .object({
    schemaVersion: z.literal("media-pipeline.outputs.v1"),
    cloudName: z.string(),
    operations: z
      .object({
        standardTransformations: z.literal(3),
        adminReads: z.literal(2),
        deliveryReads: z.literal(3),
        aiCalls: z.literal(0),
      })
      .strict(),
    outputs: z
      .array(
        z
          .object({
            imagePath: z.enum([
              "/demo/storefront.webp",
              "/demo/social.webp",
              "/demo/catalog.webp",
            ]),
            derivative: derivativeSchema,
          })
          .strict(),
      )
      .length(3),
  })
  .strict()
  .parse(recordedOutputs);

export async function readSavedOutput(recipe: PipelineRecipe) {
  const record = savedOutputs.outputs.find(
    (item) => item.derivative.recipe === recipe,
  );
  const source = demoFixture.cloudinary?.asset;
  if (
    !record ||
    !source ||
    record.imagePath !== `/demo/${recipe}.webp` ||
    record.derivative.source.assetId !== source.assetId ||
    record.derivative.source.publicId !== source.publicId ||
    record.derivative.source.version !== source.version
  )
    throw new Error("The saved output does not match its source.");
  const bytes = await readFile(
    path.join(process.cwd(), "public", record.imagePath),
  );
  const evidence = await inspectDerivativeBytes(bytes, recipe);
  if (
    evidence.bytes !== record.derivative.bytes ||
    evidence.sha256 !== record.derivative.sha256
  ) {
    throw new Error("The saved output failed its checksum verification.");
  }
  return { bytes, derivative: record.derivative };
}

export async function readPinnedSavedOutput(derivative: VerifiedDerivative) {
  const saved = await readSavedOutput(derivative.recipe);
  if (JSON.stringify(saved.derivative) !== JSON.stringify(derivative))
    throw new Error("The saved artifact changed.");
  return saved.bytes;
}
