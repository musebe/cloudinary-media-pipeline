import "server-only";
import { NextResponse } from "next/server";
import { RequestInputError } from "@/lib/http/json";
import { privateResponseHeaders } from "@/lib/server/ingestion-response";

export function executionErrorResponse(error: unknown) {
  if (error instanceof RequestInputError)
    return NextResponse.json(
      { error: error.message },
      {
        status: error.status,
        headers: privateResponseHeaders,
      },
    );
  return NextResponse.json(
    {
      error:
        "The image evidence could not be verified. Nothing was released. Try again or load the saved demo.",
    },
    {
      status: 502,
      headers: privateResponseHeaders,
    },
  );
}
