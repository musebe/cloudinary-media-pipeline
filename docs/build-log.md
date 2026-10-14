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
