# Local setup

The bundled demo and plan run without credentials. Matching Cloudinary credentials let the saved demo use its authenticated original. Local uploads add signed ingestion and Admin API readback; they do not run analysis, transformations, or approval. No external model or TypeSafe account is required.

## Start the application

Use Node.js 24 and pnpm 10, then run these commands from the project folder:

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3002](http://localhost:3002). Port 3002 keeps this application separate from other local demos. If that port is occupied, stop the process using it or choose another port and use the matching URL for your checks.

## Try the workflow preview

Choose **Storefront image**, **Social preview**, or **Catalog image**. Enter a request such as:

```text
Prepare this product image for the storefront and send it for approval.
```

Select **Load saved demo** for the existing image and its saved verification evidence. This operation never creates a new image or repeats analysis. Select **Preview workflow** to inspect the proposed output, dependencies, tools, and artifact handoffs. The request remains untrusted display text; the selected recipe fixes the plan.

The plan has five stages: upload verification, visual inspection, transformation, policy, and delivery. Transformation and policy depend on inspection; delivery depends on both branches. A verified source is marked separately. The other four stages have not run.

## Inspect the local API

Check capabilities:

```bash
curl http://localhost:3002/api/health
```

The response reports `mode: "preview"`. `planPreview` is true, while `liveExecution`, `paidAnalysis`, and `modelBackedPlanning` are false. `liveIngestion` is true only when uploads are explicitly enabled in configured local development.

Request a plan:

```bash
curl http://localhost:3002/api/pipelines/preview \
  -H 'Content-Type: application/json' \
  --data '{"recipe":"storefront","prompt":"Prepare a storefront image for approval."}'
```

The returned `plan` contains `paidCalls: 0` and `operationsPerformed: 0`. The accepted recipe IDs are `storefront`, `social`, and `catalog`. Requests must contain only `recipe` and `prompt`; the prompt must contain non-whitespace text and stay within 500 characters. The JSON body is limited to 4,096 bytes.

The execution endpoint deliberately stays unavailable:

```bash
curl -i -X POST http://localhost:3002/api/pipelines/execute
```

Expect HTTP `501` with a JSON explanation. This response does not indicate a credential error.

## Keep optional configuration private

If `.env.local` already exists, keep it and do not overwrite it. Otherwise, copy the template only when preparing for a later live checkpoint:

```bash
cp .env.example .env.local
```

| Variable                            | Intended use                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Browser-safe Cloudinary product environment name                                 |
| `CLOUDINARY_API_KEY`                | Server-side API authentication                                                   |
| `CLOUDINARY_API_SECRET`             | Server-only credential; never prefix with `NEXT_PUBLIC_`                         |
| `DEMO_SESSION_SECRET`               | Signs HTTP-only review cookies and upload tickets; at least 32 random characters |
| `ENABLE_LIVE_PIPELINE`              | `true` enables local upload/readback only; production stays read-only            |
| `ENABLE_PAID_ANALYSIS`              | Keep `false`; paid analysis is not implemented                                   |
| `MAX_UPLOAD_BYTES`                  | Application limit capped at 4,000,000 bytes; not a platform limit                |

`.env.local` is excluded from Git. Do not share credentials in screenshots, chat, logs, or source files. Only the cloud name belongs in a public environment variable. Restart the development server after editing environment variables.

`cloudinary.configured: true` means three non-placeholder values are present. The health route does not authenticate keys, so its `cloudinary.verified` stays false. Individual assets have separate readback evidence. No Cloudinary MCP connection was used in this checkpoint.

Paid AI analysis and full execution remain unavailable regardless of either flag. Only local ingestion is implemented.

## Try a local upload

Set `ENABLE_LIVE_PIPELINE=true` in the existing `.env.local` and restart the server. Choose a JPEG, PNG, or WebP in **Or choose your own image**, then select **Upload & verify image**. Bytes go directly to Cloudinary with fixed authenticated delivery, no overwrite, format limits, context, tags, and the `media-pipeline/originals` asset folder.

The server reads the immutable asset ID and compares the decoded image with the signed ten-minute intent. The original is available for review through HTTP-only, session-bound cookies. Verification is not approval. The latest upload replaces the current image-review cookie; multi-image history is not implemented.

Client checks improve feedback but are not a security boundary. The server checks the actual bytes after upload. Do not expose ingestion publicly without provider-enforced upload limits, authentication, rate limits, retention rules, and cost controls.

## Reuse the committed demo

Commit both `public/demo/product-shoe.jpg` and `fixtures/demo-image.json`. Matching Cloudinary server credentials let **Load saved demo** sign access to the existing original using local code. Its verification timestamp is historical evidence, not a fresh Admin API check. No image is uploaded or generated; ordinary delivery still uses bandwidth.

The sample asset is retained for this purpose. If it is unavailable or credentials do not match, the bundled copy remains usable. Never commit secrets or signed URLs to the fixture. Signed URLs are shareable and do not expire automatically; cookie expiry does not revoke an obtained URL.

Production is read-only even with `ENABLE_LIVE_PIPELINE=true`. The full execution route still returns `501`. Public upload is a separate hardening checkpoint.

## Run validation

```bash
pnpm check
pnpm test:e2e
```

The first command checks formatting, linting, TypeScript, unit tests, and production compilation. The second runs the browser tests. Install the browser if Playwright reports it missing:

```bash
pnpm exec playwright install chromium
```

The browser suite starts its own server on port 3003 and uses `.next-test` so it does not share your development build. If you keep the editor's dev server running while checking a production build, use `MEDIA_PIPELINE_TEST_BUILD=true pnpm check` for the same isolated output directory. Do not run both checks against that directory at once.

## Troubleshooting

| Symptom                                  | What to check                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Page cannot be reached                   | Keep `pnpm dev` running and use the port printed in its output                                 |
| Credentials appear missing after an edit | Restart `pnpm dev`; configuration presence is not authentication                               |
| Preview returns `400`                    | Choose a supported recipe and a non-empty request of at most 500 characters                    |
| Preview returns `413` or `415`           | Keep the body below 4,096 bytes and send `Content-Type: application/json`                      |
| Execute returns `501`                    | Expected: full execution remains unavailable                                                   |
| Own-image input is disabled              | Restart after configuration changes; local uploads require the enable flag and all credentials |
| No transformed output appears            | Expected: this checkpoint verifies the original only                                           |

## Before a live checkpoint

The later Cloudinary integration needs authenticated upload and asset readback, validated analysis evidence, bounded transformation parameters, explicit approval, and verified delivery. Cloudinary's [Analyze API](https://cloudinary.com/documentation/analyze_api_guide) is Public Beta. AI Vision endpoints require the AI Vision add-on, and image-quality analysis requires the Cloudinary AI Content Analysis add-on. Access, subscription requirements, and available quota must be checked before use.

No upload, transformation, AI analysis, generation, or benchmark should run without explicit authorization and a bounded budget. Keep the preview usable while those prerequisites are unresolved.
