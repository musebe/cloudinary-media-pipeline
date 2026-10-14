# Project conventions

- Work in this project only. Leave `cloudinary-jev-review` paused and untouched.
- Validate and commit each completed checkpoint. Never commit credentials or `.env.local`.
- Use the installed Next.js documentation before framework changes, and current official Cloudinary documentation for integrations.
- Keep the interface focused on the request, workflow, and evidence. Article/editorial content belongs in `docs/`.
- The initial milestone is a deterministic local plan preview. Do not label it a completed Cloudinary run or an AI multi-agent system.
- Calling functions “specialists” describes their responsibility, not model-backed intelligence.
- Keep prompts untrusted. They cannot add capabilities, URLs, code, or permissions to the allowlisted graph.
- Pin artifacts to Cloudinary immutable asset ID and version during later live checkpoints.
- Typed handoffs, bounded tool capabilities, explicit human approval, and verified delivery are required before release.
- API keys and secrets stay in server-only modules. Prefer `next-cloudinary` for Next.js delivery components/helpers and the Cloudinary v2 Node SDK for server work.
- No TypeSafe or external-model account is required for the preview milestone.
- Do not perform paid analysis, generation, live upload/transform, or benchmarks without explicit authorization and a bounded budget.
- Never invent benchmark results, approval states, Cloudinary assets, or MCP connection status.
- Use shadcn components with semantic colors, keyboard access, readable contrast, and responsive layouts.
- Keep future article code excerpts short and the final handoff to 1–2 pages.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
