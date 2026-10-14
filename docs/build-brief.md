# Build brief

## Goal

Create a simple Next.js demo where an image request becomes a traceable workflow: upload verification, visual inspection, transformation, approval, and verified delivery. Each handoff must state its input, output, and allowed tools.

Working article: **One Prompt, Many Specialists: A Verifiable Media Pipeline With Next.js and Cloudinary**. Deadline: Sunday, October 18, 2026. The article follows the completed build, not the other way around.

## Current checkpoint: local plan preview

Choose a storefront, social, or catalog recipe, enter a request, and preview five connected stages. Validate the request and the returned graph on both sides of the API. Keep capabilities fixed by the recipe; request text cannot grant permissions.

This is a deterministic workflow, not a model-backed agent system. The preview creates no asset, transformation, approval, or delivery URL. Cloudinary configuration presence is reported separately from authenticated verification.

## Remaining checkpoints

| Checkpoint                   | Outcome                                                     | Verification                                                                |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| Secure ingestion             | Constrained signed upload and authenticated asset readback  | Asset ID, version, folder, type, format, and byte size verified server-side |
| Evidence and derivative      | Collect permitted evidence and produce a bounded output     | Read back analysis and generated derivative; retain source provenance       |
| Approval and release         | Human review, fail-closed decision, and controlled delivery | No release before approval; verify the delivered derivative                 |
| Evaluation and documentation | Compare workflows on the same labeled tasks                 | Preserve run records, failures, definitions, and measured results           |

The proposed 30-task comparison remains a plan. There are no retrieval, quality, latency, or cost results to report yet. A real model-backed specialist comparison requires an affordable model provider and an agreed evaluation budget; the fixed workflow alone cannot prove it.

## Implementation choices

- Next.js 16.4 App Router, React 19.3, TypeScript, Tailwind CSS 4, and shadcn/ui.
- `next-cloudinary` for future Cloudinary media components and URL helpers; the Cloudinary v2 Node SDK stays server-only.
- Zod runtime contracts, a small allowlisted dependency graph, bounded JSON input, Vitest, and Playwright.
- A focused form and workflow view with readable contrast, keyboard access, mobile wrapping, and explicit pending/error/empty states.
- Private credentials in ignored `.env.local`; no secret values in the health response or client props.

## Cloudinary and budget constraints

Do not run uploads, transformations, AI analysis, generation, or benchmarks automatically. Credentials do not authorize spending. Agree on the operations and a bounded budget before the live checkpoint.

Cloudinary Analyze API availability, add-on subscriptions, quota, authenticated derivative generation, and delivery access requirements must be verified for the selected product environment. A signed URL does not automatically expire. No Cloudinary MCP connection or authenticated asset inspection has been verified in this checkpoint.

## Research anchors

- [Raven paper](https://arxiv.org/abs/2609.33439): composable model harnesses inspire explicit responsibilities and handoffs; this app does not implement Raven or inherit its benchmark results.
- [Next Cloudinary](https://next.cloudinary.dev/): framework-native media rendering; use `loading="eager"` only for an actual above-the-fold image and supply responsive `sizes`.
- [Cloudinary Analyze API](https://cloudinary.com/documentation/analyze_api_guide): current analysis capability and subscription requirements.
- [Cloudinary access control](https://cloudinary.com/documentation/control_access_to_media): originals, derivatives, signed delivery, and access restrictions.

Record verified changes in [the build log](./build-log.md), validate each completed checkpoint, and commit it before expanding the scope.
