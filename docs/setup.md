# Local setup

The preview runs without a Cloudinary account or API key. It produces a validated workflow plan, not a processed image. No external model, TypeSafe account, or paid analysis is required.

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

Select **Preview workflow**. Inspect the proposed output size, stage dependencies, allowed tools, and artifact handoffs. There is no image upload in this checkpoint. The request is displayed as untrusted text, while the selected recipe fixes the plan.

The plan has five stages: upload verification, visual inspection, transformation, policy, and delivery. Transformation and policy both depend on inspection; delivery depends on both branches. They describe planned responsibilities, not operations that have already run.

## Inspect the local API

Check capabilities:

```bash
curl http://localhost:3002/api/health
```

The response reports `mode: "preview"`. Its capability fields should show `planPreview: true`, with `liveExecution`, `paidAnalysis`, and `modelBackedPlanning` set to `false`.

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

| Variable                            | Intended use                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Browser-safe Cloudinary product environment name                     |
| `CLOUDINARY_API_KEY`                | Server-side API authentication                                       |
| `CLOUDINARY_API_SECRET`             | Server-only credential; never prefix with `NEXT_PUBLIC_`             |
| `DEMO_SESSION_SECRET`               | Reserved for a future reviewer cookie; at least 32 random characters |
| `ENABLE_LIVE_PIPELINE`              | Keep `false`; the live pipeline is not implemented                   |
| `ENABLE_PAID_ANALYSIS`              | Keep `false`; paid analysis is not implemented                       |
| `MAX_UPLOAD_BYTES`                  | Reserved application upload limit, not a platform limit              |

`.env.local` is excluded from Git. Do not share credentials in screenshots, chat, logs, or source files. Only the cloud name belongs in a public environment variable. Restart the development server after editing environment variables.

`cloudinary.configured: true` means the three Cloudinary variables contain non-placeholder values. It does not validate the keys, authenticate a request, or check your product environment. `cloudinary.verified` remains `false`. No authenticated Cloudinary inspection or MCP connection has been verified by this checkpoint.

Changing either enable flag to `true` cannot activate unimplemented code. Live operations remain unavailable until their implementation, authorization, and budget controls are in place.

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

| Symptom                                  | What to check                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Page cannot be reached                   | Keep `pnpm dev` running and use the port printed in its output              |
| Credentials appear missing after an edit | Restart `pnpm dev`; configuration presence is not authentication            |
| Preview returns `400`                    | Choose a supported recipe and a non-empty request of at most 500 characters |
| Preview returns `413` or `415`           | Keep the body below 4,096 bytes and send `Content-Type: application/json`   |
| Execute returns `501`                    | Expected: only plan preview is available                                    |
| No processed image appears               | Expected: no upload, analysis, transformation, or delivery has run          |

## Before a live checkpoint

The later Cloudinary integration needs authenticated upload and asset readback, validated analysis evidence, bounded transformation parameters, explicit approval, and verified delivery. Cloudinary's [Analyze API](https://cloudinary.com/documentation/analyze_api_guide) is Public Beta. AI Vision endpoints require the AI Vision add-on, and image-quality analysis requires the Cloudinary AI Content Analysis add-on. Access, subscription requirements, and available quota must be checked before use.

No upload, transformation, AI analysis, generation, or benchmark should run without explicit authorization and a bounded budget. Keep the preview usable while those prerequisites are unresolved.
