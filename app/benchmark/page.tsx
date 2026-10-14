import Link from "next/link";
import { BenchmarkWorkbench } from "@/components/benchmark-workbench";
import { Button } from "@/components/ui/button";

export default function BenchmarkPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
      <Button variant="ghost" asChild className="min-h-11 self-start">
        <Link href="/">Back to the demo</Link>
      </Button>
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Test the release boundary
        </h1>
        <p className="leading-relaxed text-muted-foreground">
          Verify that missing approval, expired runs, and mismatched artifacts
          never produce an allowed release.
        </p>
      </header>
      <BenchmarkWorkbench />
    </main>
  );
}
