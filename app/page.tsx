import { connection } from "next/server";
import Link from "next/link";
import { Cloud, GitBranch } from "lucide-react";
import { PipelineWorkbench } from "@/components/pipeline-workbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { readConfigurationStatus } from "@/lib/server/configuration";

export default async function Home() {
  await connection();
  const status = readConfigurationStatus();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl border bg-background">
            <Cloud className="size-5" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold tracking-tight">Media Pipeline Lab</p>
            <p className="text-xs text-muted-foreground">
              Cloudinary × Next.js
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">Saved demo · no generation needed</Badge>
          <Button variant="ghost" asChild className="min-h-11">
            <Link href="/benchmark">Release checks</Link>
          </Button>
        </div>
      </header>

      <section className="flex max-w-2xl flex-col gap-3 pt-3 sm:pt-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="size-4" aria-hidden="true" />A traceable media
          workflow
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          One request. Every handoff visible.
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Compare a source image with its Cloudinary output. Inspect the
          evidence, approve the result, and release a verified file.
        </p>
      </section>

      <PipelineWorkbench configuration={status} />

      <footer className="mt-auto pb-2 text-xs leading-relaxed text-muted-foreground">
        Saved demo outputs are public examples. The gate controls this
        application&apos;s release API. Metadata inspection does not replace
        content review; no model-backed agent run is claimed.
      </footer>
    </main>
  );
}
