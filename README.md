# Cloudinary media pipeline

Preview the work needed to prepare a product image for a storefront, social preview, or catalog. Choose a fixed output recipe, enter a request, and inspect each stage's dependencies, allowed tools, and output contract.

Load a reusable product-image demo without uploading or generating anything. With local uploads enabled, you can also send an image to Cloudinary and verify the stored original. Analysis, transformations, approval, and final release are not implemented yet.

## Run locally

Use Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3002](http://localhost:3002) and select **Load saved demo**. Choose an output and inspect the handoffs. **Preview workflow** changes the plan without processing the image.

The sample is committed in `public/demo/product-shoe.jpg`. Its Cloudinary asset reference, version, verification timestamp, and source checksum are in `fixtures/demo-image.json`. Demo loading reuses that saved evidence; it makes no upload, generation, analysis, or Admin API request. Without matching credentials, the bundled image and plan still work.

To try your own image locally, configure `.env.local`, set `ENABLE_LIVE_PIPELINE=true`, and restart `pnpm dev`. Choose a JPEG, PNG, or WebP within the displayed limit, then select **Upload & verify image**. The server checks the stored asset ID, version, type, format, bytes, dimensions, tags, and session context. This is ingestion evidence, not approval.

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

| Endpoint                               | Behavior                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `GET /api/health`                      | Reports preview capabilities and configuration presence without credential values               |
| `POST /api/pipelines/preview`          | Returns a validated plan for a supported recipe and a 1–500 character request                   |
| `POST /api/pipelines/execute`          | Returns `501`; live execution is not implemented                                                |
| `GET /api/demo`                        | Loads the committed demo and planned recipe without new provider operations                     |
| `POST /api/ingestions/sign`            | Issues constrained parameters and a ten-minute session-bound upload ticket in local development |
| `POST /api/ingestions/finalize`        | Reads the stored asset and verifies the signed upload intent                                    |
| `GET /api/ingestions/image?asset=<id>` | Authorizes reviewer access using HTTP-only session and image cookies                            |

See [local setup and API examples](docs/setup.md) for commands, environment variables, and troubleshooting. Cloudinary configuration is optional for the preview. A configured credential set is not an authenticated connection.

## Check changes

```bash
pnpm check
pnpm test:e2e
```

`check` runs formatting, linting, TypeScript validation, unit tests, and a production build. The browser suite checks the local interface and preview flow. If Chromium is not installed, run `pnpm exec playwright install chromium` first.

## Project layout

| Location                       | Responsibility                                                  |
| ------------------------------ | --------------------------------------------------------------- |
| `app/`                         | Demo page and API routes                                        |
| `components/`                  | Responsive interface and shadcn components                      |
| `lib/pipeline/`                | Recipes, runtime schemas, typed artifacts, and graph validation |
| `lib/server/`                  | Server-only signing, review sessions, and Cloudinary readback   |
| `lib/ingestion/`               | Image evidence contracts, verification, and signed-token checks |
| `public/demo/` and `fixtures/` | Reusable input and its saved verification record                |
| `docs/`                        | Setup, build brief, and checkpoint notes                        |

Built with Next.js 16.4, React 19.3, TypeScript, Tailwind CSS 4, shadcn/ui, Zod, Vitest, and Playwright.

## Live workflow status

Authenticated upload and readback were verified with one 379 KB sample and two Admin API reads. The sample is retained for reuse after deployment. Public uploads are intentionally disabled in production; visitors can load the saved example without creating new images.

Reviewer URLs can be shared and do not expire automatically. The cookie identifies a review session, not a production user. Public uploads need identity, rate limits, provider-enforced upload limits, retention rules, and a budget. The application checks actual byte limits after upload, so that check alone cannot prevent storage-cost abuse.

Analysis, transformations, human approval, full execution, and benchmark results remain later checkpoints. No model-backed agent run is claimed. [Next Cloudinary](https://next.cloudinary.dev/) renders the authenticated original with automatic transformations disabled to preserve its authorized path.

Future live analysis must be explicitly enabled within an agreed budget. The [Cloudinary Analyze API](https://cloudinary.com/documentation/analyze_api_guide) is Public Beta; analysis models require their relevant add-on subscriptions and consume quota. Confirm access and current limits before running a live checkpoint.
