# Architecture

A fixed recipe determines every executable operation. Free-text requests remain notes and cannot grant capabilities. These are deterministic responsibilities, not model-backed agents.

```text
Source asset and version
  -> metadata inspection
       -> fixed WebP output and byte verification
       -> explicit human review
  -> fail-closed release policy
  -> delivery verification
  -> session-proxy manifest and download
```

## Ownership

| Boundary       | Evidence and responsibility                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Browser        | Choose recipe, upload directly when local uploads are enabled, compare images, submit attestations                 |
| Next.js server | Validate inputs, sign intents, verify ownership, prepare fixed outputs, authenticate run receipts, enforce release |
| Cloudinary     | Authenticated originals, eager derivatives, immutable IDs, versions, and Admin API evidence                        |
| Repository     | Reusable source and three real derived files, historical evidence, fixed benchmark labels                          |

## Saved and uploaded runs

Saved runs use the committed Cloudinary source/derivative snapshot. The server decodes the bundled WebP and validates its checksum on preparation, release, and delivery. No new provider operations are required. Recorded timestamps remain historical; the UI does not claim fresh Cloudinary readback.

Uploaded runs are local-development only. The server rechecks source identity and session context, creates one allowlisted eager transformation, finds the derivative in Admin readback, and verifies the delivered pixels. The output retains source ID, version, recipe, exact transformation, derived ID, dimensions, bytes, hash, and verification time.

Human review starts only after the output is verified. Each approval binds run ID, source version, recipe, and output checksum. Changing input prepares a new run with no approval. Rejection stays blocked until an explicit new review.

## Session and delivery

A signed HTTP-only session cookie identifies the visitor. A separate signed, bounded compressed cookie stores the current run for twenty minutes. Authentication precedes decompression and strict schema validation. Receipts are authenticated, not encrypted.

`/api/pipelines/release` checks the policy and verifies output delivery before recording a release time. It returns a relative session-proxy URL, not a bearer Cloudinary URL. Preview is reviewer access; download additionally requires the released state. Each proxy read checks the exact bytes again.

The original reviewer endpoint redirects to a signed Cloudinary URL. Such URLs are shareable and non-expiring by themselves. The final derivative endpoint does not redirect.

## Limits

The bundled demo files are public examples, so this is an application release boundary, not universal protection of those bytes. Human attestations are not automated content moderation or legal verification. Metadata facts do not describe image meaning.

Cookie state is not a durable audit store, global idempotency mechanism, or reliable revocation system. Replayed older valid cookies can remain usable until expiration. Add user identity, durable run/review storage, atomic transitions, rate limits, cost controls, and retention before enabling public ingestion.

Paid Cloudinary analysis, generation, and model-backed orchestration are separate, unimplemented extensions. The contract benchmark does not substitute for evaluating them.
