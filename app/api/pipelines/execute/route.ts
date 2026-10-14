import { NextResponse } from "next/server";

export const runtime = "nodejs";

export function POST() {
  return NextResponse.json(
    {
      error:
        "Live execution is not available in this checkpoint. Preview a plan instead.",
    },
    { status: 501, headers: { "Cache-Control": "no-store" } },
  );
}
