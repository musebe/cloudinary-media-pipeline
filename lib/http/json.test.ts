import { describe, expect, it } from "vitest";
import { readBoundedJson } from "./json";

function jsonRequest(body: string, extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost/api/pipelines/preview", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body,
  });
}

describe("bounded JSON input", () => {
  it("parses valid JSON including multibyte characters", async () => {
    expect(await readBoundedJson(jsonRequest('{"prompt":"café"}'))).toEqual({
      prompt: "café",
    });
  });
  it("rejects malformed JSON without returning its contents", async () => {
    await expect(
      readBoundedJson(jsonRequest("private contents")),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects unsupported content types", async () => {
    await expect(
      readBoundedJson(jsonRequest("{}", { "content-type": "text/plain" })),
    ).rejects.toMatchObject({ status: 415 });
  });
  it("bounds bodies without a content-length header", async () => {
    await expect(
      readBoundedJson(jsonRequest(JSON.stringify("x".repeat(5000)))),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects oversized declared bodies", async () => {
    await expect(
      readBoundedJson(jsonRequest("{}", { "content-length": "5000" })),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects an absent body", async () => {
    const request = new Request("http://localhost/api/pipelines/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    await expect(readBoundedJson(request)).rejects.toMatchObject({
      status: 400,
    });
  });
  it("rejects invalid UTF-8 without echoing bytes", async () => {
    const request = new Request("http://localhost/api/pipelines/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0x22, 0xc3, 0x28, 0x22]),
    });
    await expect(readBoundedJson(request)).rejects.toMatchObject({
      status: 400,
      message: "The request body must contain valid JSON.",
    });
  });
});
