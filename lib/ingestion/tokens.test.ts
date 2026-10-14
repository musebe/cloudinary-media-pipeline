import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  MAX_TOKEN_BODY_BYTES,
  MAX_TOKEN_LENGTH,
  openToken,
  sealToken,
  TokenValidationError,
  type TokenKind,
} from "@/lib/ingestion/tokens";

const SECRET = "local-test-secret-that-is-at-least-32-characters";
const PAYLOAD = { id: "example", issuedAt: 1_000, expiresAt: 1_300 };

function signEncodedBody(encodedBody: string, kind: TokenKind = "intent") {
  const signature = createHmac("sha256", SECRET)
    .update(`media-pipeline.token.v1:${kind}:${encodedBody}`)
    .digest("base64url");
  return `${encodedBody}.${signature}`;
}

describe("bounded domain-separated ingestion tokens", () => {
  it.each(["session", "intent", "receipt"] as const)(
    "authenticates a %s JSON payload",
    (kind) => {
      const token = sealToken(kind, PAYLOAD, SECRET);
      expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
      expect(openToken(kind, token, SECRET)).toEqual(PAYLOAD);
    },
  );

  it("prevents one token kind from being used as another", () => {
    const session = sealToken("session", PAYLOAD, SECRET);
    const intent = sealToken("intent", PAYLOAD, SECRET);
    const receipt = sealToken("receipt", PAYLOAD, SECRET);

    expect(new Set([session, intent, receipt]).size).toBe(3);
    expect(() => openToken("intent", session, SECRET)).toThrow(
      TokenValidationError,
    );
    expect(() => openToken("receipt", intent, SECRET)).toThrow(
      TokenValidationError,
    );
    expect(() => openToken("session", receipt, SECRET)).toThrow(
      TokenValidationError,
    );
  });

  it("rejects the wrong secret", () => {
    const token = sealToken("intent", PAYLOAD, SECRET);
    expect(() => openToken("intent", token, `${SECRET}-different`)).toThrow(
      TokenValidationError,
    );
  });

  it("rejects a modified payload without echoing its contents", () => {
    const token = sealToken("intent", PAYLOAD, SECRET);
    const signature = token.split(".")[1];
    const changed = Buffer.from('{"private":"sensitive-value"}').toString(
      "base64url",
    );
    expect(() =>
      openToken("intent", `${changed}.${signature}`, SECRET),
    ).toThrow("The verification token is invalid.");
  });

  it("rejects a modified MAC", () => {
    const token = sealToken("intent", PAYLOAD, SECRET);
    const [body, signature] = token.split(".");
    const changed = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
    expect(() => openToken("intent", `${body}.${changed}`, SECRET)).toThrow(
      TokenValidationError,
    );
  });

  it("rejects malformed segments, padding, whitespace, and wrong MAC lengths", () => {
    const token = sealToken("intent", PAYLOAD, SECRET);
    const [body, signature] = token.split(".");
    const malformed = [
      "",
      body,
      `.${signature}`,
      `${body}.`,
      `${token}.extra`,
      `${body}=.${signature}`,
      `${body}.${signature}=`,
      ` ${token}`,
      `${body}.${signature.slice(1)}`,
      `${body}.${signature}a`,
    ];
    for (const candidate of malformed) {
      expect(() => openToken("intent", candidate, SECRET)).toThrow(
        TokenValidationError,
      );
    }
  });

  it("rejects noncanonical payload encoding even with an authentic MAC", () => {
    // e30 is canonical for {}; changing unused base64 bits still decodes to {}.
    expect(Buffer.from("e31", "base64url").toString("utf8")).toBe("{}");
    expect(() => openToken("intent", signEncodedBody("e31"), SECRET)).toThrow(
      TokenValidationError,
    );
  });

  it("rejects noncanonical MAC encoding with identical decoded bytes", () => {
    const token = sealToken("intent", PAYLOAD, SECRET);
    const [body, signature] = token.split(".");
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const lastIndex = alphabet.indexOf(signature.at(-1)!);
    const changed = `${signature.slice(0, -1)}${alphabet[lastIndex + 1]}`;
    expect(Buffer.from(changed, "base64url")).toEqual(
      Buffer.from(signature, "base64url"),
    );
    expect(() => openToken("intent", `${body}.${changed}`, SECRET)).toThrow(
      TokenValidationError,
    );
  });

  it("accepts exactly 3,000 UTF-8 JSON bytes and rejects one byte more", () => {
    const boundary = "a".repeat(MAX_TOKEN_BODY_BYTES - 2);
    const token = sealToken("intent", boundary, SECRET);
    expect(openToken("intent", token, SECRET)).toBe(boundary);
    expect(() => sealToken("intent", `${boundary}a`, SECRET)).toThrow(
      TokenValidationError,
    );
  });

  it("counts payload size in UTF-8 bytes, not JavaScript characters", () => {
    expect(() => sealToken("intent", "€".repeat(1_000), SECRET)).toThrow(
      TokenValidationError,
    );
    const text = "Unicode: café, 東京, 😀";
    expect(openToken("intent", sealToken("intent", text, SECRET), SECRET)).toBe(
      text,
    );
  });

  it("rejects oversized tokens before parsing", () => {
    expect(() =>
      openToken("intent", "a".repeat(MAX_TOKEN_LENGTH + 1), SECRET),
    ).toThrow(TokenValidationError);
  });

  it("rejects an oversized authenticated body", () => {
    const encoded = Buffer.from("a".repeat(MAX_TOKEN_BODY_BYTES + 1)).toString(
      "base64url",
    );
    const token = signEncodedBody(encoded);
    expect(token.length).toBeLessThanOrEqual(MAX_TOKEN_LENGTH);
    expect(() => openToken("intent", token, SECRET)).toThrow(
      TokenValidationError,
    );
  });

  it("rejects short or blank secrets for sealing and opening", () => {
    const token = sealToken("intent", PAYLOAD, SECRET);
    for (const secret of ["", "x".repeat(31), " ".repeat(32)]) {
      expect(() => sealToken("intent", PAYLOAD, secret)).toThrow(
        TokenValidationError,
      );
      expect(() => openToken("intent", token, secret)).toThrow(
        TokenValidationError,
      );
    }
  });

  it("rejects unknown runtime token kinds", () => {
    const invalidKind = "approval" as TokenKind;
    expect(() => sealToken(invalidKind, PAYLOAD, SECRET)).toThrow(
      TokenValidationError,
    );
    expect(() =>
      openToken(invalidKind, sealToken("intent", PAYLOAD, SECRET), SECRET),
    ).toThrow(TokenValidationError);
  });

  it("rejects invalid JSON or UTF-8 even when authenticated", () => {
    const invalidJson = Buffer.from("not-json").toString("base64url");
    const invalidUtf8 = Buffer.from([0x22, 0xc0, 0xaf, 0x22]).toString(
      "base64url",
    );
    const invalidBomJson = Buffer.from("\uFEFF{}").toString("base64url");
    for (const body of [invalidJson, invalidUtf8, invalidBomJson]) {
      expect(() => openToken("intent", signEncodedBody(body), SECRET)).toThrow(
        TokenValidationError,
      );
    }
  });

  it("returns a generic error for unserializable inputs", () => {
    const circular: Record<string, unknown> = {};
    Object.assign(circular, { self: circular });
    for (const payload of [undefined, BigInt(1), circular]) {
      expect(() => sealToken("intent", payload, SECRET)).toThrow(
        "The verification token is invalid.",
      );
    }
  });

  it("does not claim schema or TTL validation", () => {
    const expired = { arbitrary: true, expiresAt: 1 };
    expect(
      openToken("intent", sealToken("intent", expired, SECRET), SECRET),
    ).toEqual(expired);
  });
});
