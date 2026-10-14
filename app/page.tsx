import { connection } from "next/server";
import { Cloud, GitBranch } from "lucide-react";
import { PipelineWorkbench } from "@/components/pipeline-workbench";
import { Badge } from "@/components/ui/badge";
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
        <Badge variant="outline">Local preview · no media operations</Badge>
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
          Choose an image output and inspect the upload, analysis,
          transformation, and approval gates before anything runs.
        </p>
      </section>

      <PipelineWorkbench configuration={status} />

      <footer className="mt-auto pb-2 text-xs leading-relaxed text-muted-foreground">
        Plan preview only. No image has been uploaded, analyzed, transformed, or
        approved. Live execution and model-backed planning are not available
        yet.
      </footer>
    </main>
  );
}
