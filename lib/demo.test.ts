import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoFixture, bundledDemo } from "@/lib/demo";

describe("committed reusable demo", () => {
  it("pins the bundled bytes to the verified Cloudinary snapshot", () => {
    const bytes = readFileSync(
      new URL("../public/demo/product-shoe.jpg", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      demoFixture.cloudinary?.sha256,
    );
    expect(bytes.length).toBe(demoFixture.cloudinary?.asset.bytes);
    expect(demoFixture.cloudinary?.asset.executionComplete).toBe(false);
    expect(demoFixture.cloudinary?.asset.deliveryType).toBe("authenticated");
  });
  it("keeps the initial local example distinct from saved verification", () => {
    expect(bundledDemo.source).toBe("bundled-demo");
    expect(bundledDemo.asset).toBeNull();
    expect(bundledDemo.imageUrl).toBe("/demo/product-shoe.jpg");
    expect(JSON.stringify(demoFixture)).not.toMatch(
      /api[_-]?secret|api[_-]?key|s--[a-zA-Z0-9_-]{8}--/,
    );
  });
});
