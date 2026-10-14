import { NextResponse } from "next/server";
import { runBenchmark } from "@/lib/benchmark/run";

export const runtime = "nodejs";
export function GET(request: Request) {
  const download = new URL(request.url).searchParams.get("download") === "1";
  return NextResponse.json(runBenchmark(), {
    headers: {
      "Cache-Control": "no-store",
      ...(download
        ? {
            "Content-Disposition":
              'attachment; filename="release-contracts-v1-results.json"',
          }
        : {}),
    },
  });
}
