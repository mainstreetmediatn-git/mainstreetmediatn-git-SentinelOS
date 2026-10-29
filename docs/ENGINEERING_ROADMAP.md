# SentinelOS engineering roadmap

This roadmap tracks the work after the initial Sentinel Core foundation.

## Completed foundation

- [x] Extract the UI state into the typed \`SentinelCoreApi\`.
- [x] Define agent manifests, capability protocols, policy decisions, approvals, and execution receipts.
- [x] Add the local Civitas adapter and optional HTTP Civitas adapter.
- [x] Persist the local audit stream and surface durable activity in the UI.
- [x] Add local authentication and revocable device pairing.

## Next engineering steps

- [x] Add production transport adapters for identity, audit events, and device pairing behind explicit HTTP contracts.
- [x] Add remote session/device hydration with local fallback for offline development.
- [x] Replace the local audit-only path with a durable outbox that retries remote event delivery without losing the local trail.
- [x] Add contract tests for remote payloads and failure behavior.
- [ ] Connect deployment secrets and the Civitas/API endpoints in the hosting environment.
- [x] Add Core API integration checks for approval, execution receipt, sign-out, and device revocation flows.
- [ ] Add browser-level end-to-end checks once a hosted test environment is configured.

## Current boundary

The production adapters use these versioned endpoints:

- \`GET /v1/auth/session\`
- \`POST /v1/auth/session\`
- \`POST /v1/auth/sign-out\`
- \`GET /v1/devices\`
- \`POST /v1/devices/pair/challenge\`
- \`POST /v1/devices/pair\`
- \`POST /v1/devices/:deviceId/revoke\`
- \`POST /v1/audit/events\`

The response bodies are JSON and may be wrapped as \`{ session }\`, \`{ devices }\`, \`{ challenge }\`, or \`{ device }\`. The client sends a bearer token when one is available.
