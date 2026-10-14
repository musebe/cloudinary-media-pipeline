import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  readSavedOutput,
  readPinnedSavedOutput,
  savedOutputs,
} from "@/lib/server/demo-outputs";
import { recipeMetadata } from "@/lib/pipeline/contracts";
import { getRecipeTransformation } from "@/lib/execution/contracts";

vi.mock("server-only", () => ({}));

describe("committed Cloudinary derivative evidence", () => {
  it("records exactly three standard outputs without any approval or credentials", () => {
    expect(savedOutputs.outputs).toHaveLength(3);
    expect(savedOutputs.operations).toEqual({
      standardTransformations: 3,
      adminReads: 2,
      deliveryReads: 3,
      aiCalls: 0,
    });
    expect(
      new Set(savedOutputs.outputs.map((item) => item.derivative.recipe)).size,
    ).toBe(3);
    expect(JSON.stringify(savedOutputs)).not.toMatch(
      /api_secret|api_key|s--|approved|released/,
    );
  });
  it.each(recipeMetadata)(
    "decodes and hashes the bundled $id WebP without a provider call",
    async ({ id, width, height }) => {
      const output = await readSavedOutput(id);
      const bytes = await readFile(`public/demo/${id}.webp`);
      expect(output.bytes).toEqual(bytes);
      expect(output.derivative).toMatchObject({
        recipe: id,
        width,
        height,
        format: "webp",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        transformation: getRecipeTransformation(id),
      });
      await expect(readPinnedSavedOutput(output.derivative)).resolves.toEqual(
        bytes,
      );
      await expect(
        readPinnedSavedOutput({ ...output.derivative, sha256: "0".repeat(64) }),
      ).rejects.toThrow("changed");
    },
  );
});
