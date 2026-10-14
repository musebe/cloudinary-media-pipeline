import { createHmac, timingSafeEqual } from "node:crypto";

export type TokenKind = "session" | "intent" | "receipt";

export const MAX_TOKEN_LENGTH = 4_096;
export const MAX_TOKEN_BODY_BYTES = 3_000;
const TOKEN_DOMAIN = "media-pipeline.token.v1";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/;
const TOKEN_KINDS: readonly TokenKind[] = ["session", "intent", "receipt"];

export class TokenValidationError extends Error {
  constructor() {
    super("The verification token is invalid.");
    this.name = "TokenValidationError";
  }
}

function assertTokenParameters(kind: TokenKind, secret: string) {
  if (
    !TOKEN_KINDS.includes(kind) ||
    typeof secret !== "string" ||
    secret.length < 32 ||
    secret.trim().length === 0
  ) {
    throw new TokenValidationError();
  }
}

function tokenMac(kind: TokenKind, encodedBody: string, secret: string) {
  return createHmac("sha256", secret)
    .update(`${TOKEN_DOMAIN}:${kind}:${encodedBody}`)
    .digest();
}

/** Authenticate a bounded JSON payload; this does not encrypt its contents. */
export function sealToken(
  kind: TokenKind,
  payload: unknown,
  secret: string,
): string {
  assertTokenParameters(kind, secret);

  try {
    const serialized = JSON.stringify(payload);
    if (serialized === undefined) throw new TokenValidationError();

    const body = Buffer.from(serialized, "utf8");
    if (body.byteLength > MAX_TOKEN_BODY_BYTES)
      throw new TokenValidationError();

    const encodedBody = body.toString("base64url");
    const signature = tokenMac(kind, encodedBody, secret).toString("base64url");
    const token = `${encodedBody}.${signature}`;
    if (token.length > MAX_TOKEN_LENGTH) throw new TokenValidationError();

    return token;
  } catch {
    throw new TokenValidationError();
  }
}

/** Authenticate first, then decode. Callers must validate schema and expiry. */
export function openToken(
  kind: TokenKind,
  token: string,
  secret: string,
): unknown {
  assertTokenParameters(kind, secret);

  if (
    typeof token !== "string" ||
    token.length > MAX_TOKEN_LENGTH ||
    !TOKEN_PATTERN.test(token)
  ) {
    throw new TokenValidationError();
  }

  try {
    const [encodedBody, encodedSignature] = token.split(".");
    const signature = Buffer.from(encodedSignature, "base64url");
    if (
      signature.byteLength !== 32 ||
      signature.toString("base64url") !== encodedSignature ||
      !timingSafeEqual(tokenMac(kind, encodedBody, secret), signature)
    ) {
      throw new TokenValidationError();
    }

    const body = Buffer.from(encodedBody, "base64url");
    if (
      body.byteLength > MAX_TOKEN_BODY_BYTES ||
      body.toString("base64url") !== encodedBody
    ) {
      throw new TokenValidationError();
    }

    const json = new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: true,
    }).decode(body);
    return JSON.parse(json) as unknown;
  } catch {
    throw new TokenValidationError();
  }
}
