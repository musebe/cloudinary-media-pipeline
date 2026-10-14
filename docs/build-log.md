# Build log

## October 14, 2026 — local workflow preview

Scaffolded the project with `create-cloudinary-next`, updated Next.js and React, and added the shadcn interface, server-only Cloudinary client preparation, and private environment template. A random reviewer-session secret was added locally without displaying or committing its value.

The first usable slice is a validated plan preview. Storefront, social, and catalog recipes produce five typed stages. Validation rejects cycles, duplicate or missing stages, altered tools, invalid artifacts, and output settings that do not match the selected recipe. The API limits JSON bodies to 4,096 bytes and request text to 500 characters.

Replaced the scaffold's instructional panel and sample bicycle image with the demo. Removed the conflicting starter stylesheet, strengthened supporting-text contrast, wrapped the recipe controls for small screens, and enlarged stage-detail touch targets. There is no sample image left to trigger the reported bicycle LCP warning. No image has been processed.

The health endpoint reports configuration presence only; live execution returns HTTP `501`. Populated environment variables and enable flags cannot activate unimplemented operations. No external model or authenticated Cloudinary request has run.

Verified validation:

- Formatting, ESLint, TypeScript, and the Next.js 16.4 production build passed.
- 54 unit tests passed across graph contracts, configuration, and bounded JSON input.
- 11 Playwright checks passed: desktop and mobile previews, recipe changes, stale-plan clearing, non-JSON errors, text contrast, and local API behavior.
- No horizontal overflow at 320px or 390px. Checked text contrast was at least 5.68:1 in the manual browser sample; the regression suite requires 4.5:1 for the selected surfaces. This is not a full accessibility certification.
- Browser tests blocked external requests and confirmed no media loading. The health endpoint returned configuration booleans without credential values.
- The private environment file is ignored, and scanning the source files found none of the local credential values.

Browser screenshots remain in the ignored `.test-artifacts/` folder. The test server uses port 3003 and a separate `.next-test` output directory, leaving the editor's server intact. The isolated production check used `MEDIA_PIPELINE_TEST_BUILD=true pnpm check`.

Next: constrained ingestion and authenticated readback, once live-operation scope and budget are agreed.

## October 14, 2026 — authenticated ingestion and reusable demo

Added a committed product-image source and a **Load saved demo** action. Local upload uses signed direct delivery to Cloudinary's image endpoint, fixed authenticated type, an immutable generated public ID, overwrite disabled, allowed formats, a dedicated asset folder, and session context. Finalization reads the stored asset by immutable ID and checks format, actual bytes, decoded dimensions, tag, identity, and session ownership against the signed intent.

User-authorized verification used exactly one 379,132-byte JPEG upload and two Admin API reads. The original is 1870 × 1250. Authenticated original delivery matched the bundled image's SHA-256 checksum. The asset was retained following the request for a reusable deployed demo. Its reference, version, timestamp, and checksum are stored in `fixtures/demo-image.json`; no credentials or signed URL are stored there.

Demo loading reuses that historical verification record without Admin API reads, uploads, AI calls, or transformations. Signing its existing original is local code. Browser delivery still uses bandwidth. The bundled copy works without matching credentials and is the fallback if Cloudinary delivery fails.

Upload tickets expire after ten minutes. Reviewer and current-image receipts use HTTP-only, session-bound cookies; receipts are not placed in URL query strings. Original display uses `CldImage` with the authorized URL preserved and automatic transformations disabled. That prevents accidental new authenticated derivatives in this checkpoint.

Production uploads are disabled regardless of the environment flag. Authentication, provider-enforced upload limits, rate limits, retention, and cost controls are required before public ingestion. Cloudinary signed URLs remain shareable and do not expire automatically; cookie expiry does not revoke one already obtained.

No AI analysis, generation, transformed output, approval, or final release has run. The plan UI marks ingestion evidence separately from the four pending stages. Full execution still returns `501`.

Validation: formatting, ESLint, TypeScript, 195 unit checks, 14 browser/API checks, and the production build passed. A production-server smoke test returned HTTP 200 for health and the saved-demo loader, reused the version-pinned snapshot, and confirmed uploads stay disabled. Desktop and mobile browser checks intercepted Cloudinary delivery with the identical bundled file, verified the exact authorized `CldImage` source without a transformation `srcset`, and found no runtime errors or horizontal overflow. This isolated browser check added no provider operations; real original delivery was checked in the authorized live test above.

## October 14, 2026 — verified standard outputs

User-authorized processing created exactly three standard transformations from the retained original: 1200 × 1200 padded storefront, 1200 × 630 center-cropped social preview, and 1600 × 1600 padded catalog. All outputs use WebP at quality 80. Two Admin API reads verified source and derived identities; three delivery reads verified content type, decoded pixels, dimensions, bytes, and SHA-256. This used five of the six authorized verification reads. No AI analysis or generation ran.

Committed the actual downloaded derivatives and their historical evidence in `public/demo/` and `fixtures/demo-outputs.json`. The demo rechecks their local bytes, so running it after deployment needs no new transformation or provider analysis. The three files are 44,328, 38,150, and 67,144 bytes respectively.

The new pure release contracts require matching source/version/recipe, inspection facts, a verified derivative, an unexpired run, and a bound human approval. Metadata inspection records technical facts only; content and rights remain explicit reviewer attestations. Focused execution and transformation tests use local synthetic buffers and mocked providers, not additional live calls.
