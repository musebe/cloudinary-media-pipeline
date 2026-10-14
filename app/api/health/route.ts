import { NextResponse } from "next/server";
import { readConfigurationStatus } from "@/lib/server/configuration";

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json(
    { status: "ok", ...readConfigurationStatus() },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
