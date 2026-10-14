# Cloudinary media pipeline

Preview the work needed to prepare a product image for a storefront, social preview, or catalog. Choose a fixed output recipe, enter a request, and inspect each stage's dependencies, allowed tools, and output contract.

The current version is a local plan preview. It does not upload images, analyze content, transform assets, or release media. No credentials or paid API calls are needed to try it.

## Run locally

Use Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3002](http://localhost:3002). Choose an output, enter a request, and select **Preview workflow**. The plan should show five stages and report zero media operations.

| Output recipe    | Planned size | Fit  |
| ---------------- | ------------ | ---- |
| Storefront image | 1200 × 1200  | Pad  |
| Social preview   | 1200 × 630   | Fill |
| Catalog image    | 1600 × 1600  | Pad  |

The request is display-only text. The selected recipe determines the output settings; text in the request cannot add tools, execute code, choose a remote URL, or bypass a dependency.

## Follow the handoffs

```text
Upload and verify
  → Collect visual evidence
      → Prepare the fixed format ─┐
      → Check release requirements ─┤
                                   → Release after both gates
```

Each stage declares the artifacts it accepts and produces. The planner validates the graph for cycles, missing stages, altered capabilities, and unsafe handoffs. “Specialist” describes a stage's responsibility, not an AI agent or model call.

## Local API

| Endpoint                      | Behavior                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/health`             | Reports preview capabilities and configuration presence without credential values |
| `POST /api/pipelines/preview` | Returns a validated plan for a supported recipe and a 1–500 character request     |
| `POST /api/pipelines/execute` | Returns `501`; live execution is not implemented                                  |

See [local setup and API examples](docs/setup.md) for commands, environment variables, and troubleshooting. Cloudinary configuration is optional for the preview. A configured credential set is not an authenticated connection.

## Check changes

```bash
pnpm check
pnpm test:e2e
```

`check` runs formatting, linting, TypeScript validation, unit tests, and a production build. The browser suite checks the local interface and preview flow. If Chromium is not installed, run `pnpm exec playwright install chromium` first.

## Project layout

| Location        | Responsibility                                                  |
| --------------- | --------------------------------------------------------------- |
| `app/`          | Demo page and API routes                                        |
| `components/`   | Responsive interface and shadcn components                      |
| `lib/pipeline/` | Recipes, runtime schemas, typed artifacts, and graph validation |
| `lib/server/`   | Server-only configuration and Cloudinary client preparation     |
| `docs/`         | Setup, build brief, and checkpoint notes                        |

Built with Next.js 16.4, React 19.3, TypeScript, Tailwind CSS 4, shadcn/ui, Zod, Vitest, and Playwright.

## Live workflow status

Cloudinary upload, authenticated asset readback, analysis, transformations, human approval, and signed delivery are later checkpoints. Neither environment flags nor a populated `.env.local` enable those features today. There is no completed live run or benchmark result in this version.

Future live analysis must be explicitly enabled within an agreed budget. The [Cloudinary Analyze API](https://cloudinary.com/documentation/analyze_api_guide) is Public Beta; analysis models require their relevant add-on subscriptions and consume quota. Confirm access and current limits before running a live checkpoint.
