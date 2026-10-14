import { afterEach, describe, expect, it, vi } from "vitest";
import { validateSelectedImage, uploadAndVerify } from "@/lib/client/ingestion";

const request = {
  recipe: "storefront" as const,
  prompt: "Keep the full product visible.",
};
const png = [137, 80, 78, 71, 13, 10, 26, 10];

afterEach(() => vi.unstubAllGlobals());

describe("browser image validation", () => {
  it.each([
    ["image/png", png, "product.png"],
    ["image/jpeg", [255, 216, 255, 0], "product.jpg"],
    ["image/webp", Array.from(Buffer.from("RIFF0000WEBP")), "product.webp"],
  ])("accepts an allowlisted %s header", async (mime, header, filename) => {
    const file = new File([new Uint8Array(header)], filename, { type: mime });
    expect(await validateSelectedImage(file, request, 4000000)).toMatchObject({
      mimeType: mime,
      bytes: header.length,
    });
  });
  it("rejects a misleading MIME type", async () => {
    const file = new File(["not an image"], "product.png", {
      type: "image/png",
    });
    await expect(validateSelectedImage(file, request, 4000000)).rejects.toThrow(
      "file header",
    );
  });
  it("rejects an oversized or empty file before requesting authorization", async () => {
    for (const file of [
      new File([], "empty.png", { type: "image/png" }),
      new File([new Uint8Array(png)], "big.png", { type: "image/png" }),
    ]) {
      await expect(validateSelectedImage(file, request, 1)).rejects.toThrow(
        "upload limit",
      );
    }
  });
  it("returns a clear service error rather than parsing plain text as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("The deployment failed", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array(png)], "product.png", {
      type: "image/png",
    });
    const input = await validateSelectedImage(file, request, 4000000);
    await expect(uploadAndVerify(file, input, vi.fn())).rejects.toThrow(
      "unexpected response",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
