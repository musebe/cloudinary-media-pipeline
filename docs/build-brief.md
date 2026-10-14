# Build brief

## Goal

Create a focused Next.js demo that traces image preparation from verified source to fixed output, human approval, and controlled delivery. Every handoff states its input, output, and allowed capabilities.

Working article: **One Prompt, Many Specialists: A Verifiable Media Pipeline With Next.js and Cloudinary**. Deadline: Sunday, October 18, 2026. The article follows the completed build.

## Completed workflow

| Checkpoint           | Implemented proof                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Secure ingestion     | Signed direct upload, authenticated originals, ownership and immutable-ID readback                           |
| Evidence and output  | Technical metadata inspection, three bounded standard recipes, derived identity and actual pixel/byte checks |
| Approval and release | Explicit attestations, rejection, fail-closed policy, session-bound output proxy, downloadable evidence      |
| Evaluation           | Thirty deterministic contract cases with fixed labels and reproducible results                               |
| Reusable demo        | Committed source and three real Cloudinary outputs; no new generation or transformation needed               |
| Verification         | 464 unit tests, 26 browser/API checks, production build, desktop/mobile production smoke checks              |

## Scope clarification

This implementation uses deterministic workflow responsibilities, not AI agents. Free-text requests are untrusted notes. Metadata inspection cannot infer content; human reviewers check composition, appropriate use, and rights.

The original model-backed thirty-task comparison remains a separate experiment requiring a provider and budget. The completed release-contract benchmark must not be described as that comparison. Paid analysis and generation remain off.

## Implementation

Next.js 16.4 App Router, React 19.3, TypeScript, Tailwind CSS 4, shadcn/ui, Next Cloudinary, Cloudinary Node SDK v2, Zod, Sharp, Vitest, and Playwright.

Source and derived evidence are pinned to immutable asset ID and version. Review is bound to run ID, recipe, and output checksum. Production uploads stay disabled; the saved workflow works with a configured reviewer-session secret.

## Verified Cloudinary operations

One authorized retained source upload and two Admin reads completed first. A later authorized test generated three standard WebP outputs and used two Admin reads plus three delivery checks. No AI analysis or generation ran. No Cloudinary MCP connection was used.

The public bundled demo controls application release, not access to all sample bytes. Signed original URLs are shareable. Final output uses a session proxy. Cookie receipts are not durable state or a revocation system.

## Research anchors

- [Raven paper](https://arxiv.org/abs/2609.33439): inspiration for explicit responsibilities, not an implemented model harness or inherited benchmark.
- [Next Cloudinary](https://next.cloudinary.dev/): framework-native rendering and URL helpers.
- [Cloudinary eager transformations](https://cloudinary.com/documentation/eager_and_incoming_transformations): generation and canonical output paths.
- [Cloudinary access control](https://cloudinary.com/documentation/control_access_to_media): authenticated assets and signed delivery limits.

Next: article research, overlap audit, and drafting from the verified implementation. Keep the eventual handoff to one or two pages.
