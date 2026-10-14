import "server-only";
import { NextResponse } from "next/server";
import { RequestInputError } from "@/lib/http/json";
import { IngestionValidationError } from "@/lib/ingestion/verify";

export const privateResponseHeaders = { "Cache-Control": "private, no-store" };

export function ingestionErrorResponse(error: unknown) {
  if (error instanceof RequestInputError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status, headers: privateResponseHeaders },
    );
  }
  if (error instanceof IngestionValidationError) {
    return NextResponse.json(
      { error: error.message },
      { status: 409, headers: privateResponseHeaders },
    );
  }
  return NextResponse.json(
    {
      error:
        "Cloudinary verification did not complete. No image was approved or released. Try again.",
    },
    { status: 502, headers: privateResponseHeaders },
  );
}
