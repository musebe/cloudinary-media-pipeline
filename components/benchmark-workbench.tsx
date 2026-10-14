"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import {
  benchmarkResultSchema,
  type BenchmarkResult,
} from "@/lib/benchmark/contracts";
import { readApiJson } from "@/lib/client/execution";

export function BenchmarkWorkbench() {
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Card>
      <CardHeader>
        <CardTitle>30 release checks</CardTitle>
        <CardDescription>
          Three approved recipes and 27 cases that must stay blocked. No
          Cloudinary writes or AI calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap gap-3">
          <Button
            className="min-h-11"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  const response = await fetch("/api/benchmark", {
                    signal: AbortSignal.timeout(10_000),
                  });
                  setResult(
                    benchmarkResultSchema.parse(await readApiJson(response)),
                  );
                } catch {
                  setError("The checks could not be completed. Try again.");
                }
              });
            }}
          >
            {pending ? "Running checks…" : "Run contract benchmark"}
          </Button>
          {result ? (
            <Button variant="outline" asChild className="min-h-11">
              <a href="/api/benchmark?download=1">Download results</a>
            </Button>
          ) : null}
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Benchmark unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {result ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3" role="status">
              {[
                [
                  "Contract checks passed",
                  `${result.passed}/${result.caseCount}`,
                ],
                ["False releases", result.falseReleaseCount],
                ["False blocks", result.falseBlockCount],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex flex-col gap-2 rounded-lg border p-4"
                >
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <Badge variant="outline" className="self-start">
              {result.version}
            </Badge>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {result.limitation}
            </p>
            <Table>
              <TableCaption>
                Expected labels are fixed in the dataset. A passing check
                matches both the decision and reason code.
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Actual</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.results.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <span className="inline-block max-w-64 whitespace-normal">
                        {item.id} · {item.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {item.expectedAllowed ? "Allow" : "Block"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-block max-w-40 break-all whitespace-normal">
                        {item.actualCode}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={item.passed ? "secondary" : "destructive"}
                      >
                        {item.passed ? "Pass" : "Fail"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run the fixed dataset to measure the release policy. This is not an
            image-quality or AI-agent benchmark.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
