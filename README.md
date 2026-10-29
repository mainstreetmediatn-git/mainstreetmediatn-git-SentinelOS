# Sentinel OS

Sentinel OS is an agent-first command and orchestration layer for coordinating AI agents, automations, memory, devices, and approval policy from one interface.

## Core foundation

The current application shell is backed by a typed \`SentinelCoreApi\`:

- \`src/core/runtime.ts\` defines the agent manifest, capability protocol, policy decisions, approval records, Civitas adapter contract, execution receipts, and audit events.
- \`src/core/api.ts\` exposes one reactive state surface for the UI and command methods for execution, approvals, authentication, and device pairing.
- \`src/core/auth.ts\` provides local session persistence and revocable device pairing tokens.
- \`AuditStore\` persists the latest audit events to browser local storage and remains injectable for a server or database-backed store.
- \`HttpCivitasAdapter\` connects the same protocol to a Civitas service. Set \`VITE_CIVITAS_URL\` to enable it; without that variable the app uses the deterministic local adapter.

The execution path is:

\`\`\`text
UI command
  -> SentinelCoreApi
  -> agent + capability registry
  -> policy evaluation
  -> approval record when required
  -> Civitas adapter
  -> execution receipt + durable audit event
\`\`\`

High and critical risk capabilities, including \`repo.write\`, cannot execute until the matching approval record is approved. Every request receives a receipt, including denied and approval-required outcomes.

## Run locally

\`\`\`bash
npm install
npm run dev
\`\`\`

Production build:

\`\`\`bash
npm run build
\`\`\`

Tests:

\`\`\`bash
npm test
\`\`\`

Optional Civitas endpoint:

\`\`\`bash
VITE_CIVITAS_URL=https://civitas.example.com npm run dev
\`\`\`

## Architecture direction

Sentinel is the authority and control plane. Civitas is the multi-agent coordination adapter. Domain agents and external capabilities execute underneath those layers.

\`\`\`text
User
  ↓
Sentinel Core API
  ↓
Policy / Approval Gates
  ↓
Civitas Adapter
  ↓
Agents + Capabilities + Devices
\`\`\`

The next hardening step is to replace the local auth and local-storage adapters with the production identity and durable event store used by the deployment environment.
