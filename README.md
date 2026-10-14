# Cloudinary media pipeline

Prepare a storefront, social, or catalog image through a traceable workflow. Compare the original with its output, inspect the evidence, approve or reject the result, and download a verified WebP.

The saved demo includes real Cloudinary outputs in the repository. The storefront output appears immediately on first load, with no run started or approval granted. Visitors can run the complete review and release flow without uploading or generating new images.

## Run locally

Use Node.js 24 and pnpm 10.

```bash
git clone https://github.com/musebe/cloudinary-media-pipeline.git
cd cloudinary-media-pipeline
pnpm install
```

Keep your existing `.env.local`. For a fresh clone, copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
openssl rand -hex 32
```

Paste the generated value into `DEMO_SESSION_SECRET` in `.env.local`. That secret enables server-side review sessions. The bundled demo does not require Cloudinary API credentials. Leave both processing flags set to `false` for the saved demo.

```bash
pnpm dev
```

Open [http://localhost:3002](http://localhost:3002). Restart the server after changing environment variables.

## Try the demo

1. Select **Load saved demo**.
2. Choose **Storefront**, **Social preview**, or **Catalog**, then select **Prepare output**.
3. Compare the source with the prepared image.
4. Accept the three review checks and select **Approve output**, or select **Reject output**.
5. Select **Verify & release**, then **Download WebP** or **Download evidence**.

**Preview workflow** shows the fixed handoffs without preparing an output. **Resume previous review** restores the current browser session after refresh; runs expire after twenty minutes. **Start new review** clears approval and reuses the verified output.

The first storefront output is visible before any interaction. You can also select **Review this output** to begin its review.

| Output         | Dimensions  | Fit                   | Saved file size |
| -------------- | ----------- | --------------------- | --------------: |
| Storefront     | 1200 × 1200 | Pad, white background |    44,328 bytes |
| Social preview | 1200 × 630  | Center crop           |    38,150 bytes |
| Catalog        | 1600 × 1600 | Pad, white background |    67,144 bytes |

All outputs use WebP at quality 80. The request is an untrusted note: it cannot add tools, choose a URL, execute code, change transformation parameters, or bypass review. The selected recipe controls processing.

## Follow the evidence

The source is identified by immutable Cloudinary asset ID and version. Each output records its exact transformation, derived asset ID, dimensions, bytes, verification time, and SHA-256 checksum. Saved evidence is historical; the application checks the bundled output bytes again when preparing, releasing, and downloading.

Metadata inspection checks technical facts, not image meaning. Composition, appropriate content, and usage rights require human attestations. The release policy blocks missing approval, rejected or expired runs, and mismatched source, recipe, or output evidence.

**Release checks** opens the [30-case benchmark](http://localhost:3002/benchmark). It tests three allowed recipes and 27 expected blocks, with downloadable results. The verified run passed 30/30 cases with zero false releases or false blocks. This measures deterministic contract behavior, not AI accuracy or content safety. See [the evaluation protocol](docs/benchmark.md).

## Use your own image locally

Configure the Cloudinary variables in `.env.local`, set `ENABLE_LIVE_PIPELINE=true`, and restart the server. Choose a JPEG, PNG, or WebP under the displayed limit, then select **Upload & prepare output**.

The browser uploads directly to an authenticated Cloudinary asset in `media-pipeline/originals`. The server verifies ownership and source facts, generates one standard eager transformation, reads the derivative back, and checks its delivered pixels and checksum. Original display uses reviewer access; final download uses a session-checked proxy.

Each new uploaded-output preparation consumes a standard transformation and verification reads. Repeating an unchanged current run reuses its evidence; it is not a global cache. No AI generation, paid analysis, or model provider is used. Production uploads remain disabled even if the flag is set.

## Public demo configuration

The hosted application reuses the committed example files. It needs a random server-only `DEMO_SESSION_SECRET` of at least 32 characters. Set `ENABLE_LIVE_PIPELINE=false` and `ENABLE_PAID_ANALYSIS=false`. Cloudinary API keys and secrets are not required for this saved-demo mode and should not be added to the public deployment.

Visitors can compare all three outputs, review them, and download an approved result. They cannot upload images or trigger Cloudinary transformations or paid analysis.

## Checks and source

```bash
pnpm check
pnpm test:e2e
```

Validation currently passes 464 unit tests, 26 browser/API checks, lint, TypeScript, formatting, and the production build. Browser tests cover desktop, mobile, readable contrast, release gating, restoration, and errors. If needed, install Chromium with `pnpm exec playwright install chromium`.

| Location                           | Responsibility                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `lib/pipeline/`                    | Fixed recipes and validated graph                                                                                       |
| `lib/ingestion/`                   | Source contracts, upload verification, authenticated tokens                                                             |
| `lib/execution/`                   | Run contracts, human review, fail-closed release policy                                                                 |
| `lib/server/`                      | Cloudinary calls, session receipts, derivative verification, output proxy                                               |
| `public/demo/` and `fixtures/`     | Reusable source, real outputs, and recorded Cloudinary evidence                                                         |
| `benchmarks/` and `lib/benchmark/` | Labeled cases and deterministic evaluation                                                                              |
| `docs/`                            | [Setup](docs/setup.md), [architecture](docs/architecture.md), [build evidence](docs/build-log.md), and article planning |

Built with Next.js 16.4, React 19.3, TypeScript, shadcn/ui, [Next Cloudinary](https://next.cloudinary.dev/), the Cloudinary Node SDK, Zod, Sharp, Vitest, and Playwright.

## Boundaries

The committed example files are public. The gate controls this application's release API, not universal access to those sample bytes. Reviewer Cloudinary URLs are shareable and do not expire automatically. Released downloads stay behind the application session proxy.

Cookies are authenticated, not encrypted. They store the current run, not a durable audit history; replayed older cookies cannot be reliably revoked without server state. Human checks do not establish legal rights or guarantee safe content. Before public uploads, add real identity, durable state, rate limits, provider-enforced upload limits, retention, and cost controls.

The originally proposed model-backed specialist comparison is a separate extension requiring an agreed provider and budget. This application implements deterministic workflow stages and does not claim AI-agent behavior.
