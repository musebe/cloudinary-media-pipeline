import { z } from "zod";
import {
  executionResponseSchema,
  manifestSchema,
} from "@/lib/execution/requests";

export async function readApiJson(response: Response): Promise<unknown> {
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error(
      "The service returned an unexpected response. Please try again.",
    );
  }
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string().max(300) }).safeParse(payload);
    throw new Error(
      error.success
        ? error.data.error
        : "The request did not complete. Nothing was released.",
    );
  }
  return payload;
}

export async function requestExecutionAction(
  action: "execute" | "review" | "release" | "restart",
  body: unknown,
) {
  const response = await fetch(`/api/pipelines/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(action === "execute" ? 60_000 : 30_000),
  });
  const payload = await readApiJson(response);
  if (action === "release") {
    const released = executionResponseSchema
      .extend({ manifest: manifestSchema })
      .parse(payload);
    const { manifest, ...result } = released;
    return { result, manifest };
  }
  return { result: executionResponseSchema.parse(payload), manifest: null };
}
