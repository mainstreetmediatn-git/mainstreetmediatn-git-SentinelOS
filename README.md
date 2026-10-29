# Sentinel OS

Sentinel OS is an agent-first command and orchestration layer for coordinating AI agents, automations, memory, devices, and approval policy from one interface.

## Current application

The repository contains a React + TypeScript + Vite application shell with:

- Command Center
- Agent workforce / Civitas network
- Automations workspace
- Memory workspace
- Device fabric
- Activity / audit stream
- System settings
- Responsive mobile navigation
- Typed Sentinel runtime with policy decisions and execution receipts
- Typed Civitas HTTP adapter for real backend execution

## Architecture direction

Sentinel is the authority and control plane. Civitas is the durable multi-agent coordination layer. Domain agents and external capabilities execute underneath those layers.

```text
User
  ↓
Sentinel Core
  ↓
Policy / Approval
  ↓
Civitas HTTP adapter
  ↓
Civitas worker and agent runtime
  ↓
Agents + Capabilities + Devices
```

## Runtime bridge

Set `VITE_CIVITAS_URL` to make the Command Center submit typed execution envelopes to Civitas. Without it, the app uses an explicitly labeled local-development adapter so local UI work remains runnable without a backend.

```bash
CIVITAS_URL=http://127.0.0.1:8788 CIVITAS_API_TOKEN=secret npm run dev
# or run the standalone gateway:
CIVITAS_URL=http://127.0.0.1:8788 CIVITAS_API_TOKEN=secret npm run bff
```

For local development, the Vite proxy can attach `CIVITAS_API_TOKEN` from the Node process environment. The browser never receives that credential. For deployment, run `npm run bff` behind the authenticated Sentinel session/identity layer and set `CIVITAS_URL` plus server-only `CIVITAS_API_TOKEN`; do not define any `VITE_*TOKEN` value. In production the BFF requires the trusted proxy to provide `x-forwarded-user` and `x-forwarded-authorization` (or the configured header names); it forwards that authenticated identity to Civitas OIDC rather than accepting browser-supplied credentials.

The Command Center now sends `task.plan` requests and displays the returned receipt status. Configure Civitas with `CIVITAS_AGENT_RUNTIME=openai` and the optional `civitas[agent-runtime]` dependency to enable the OpenAI Agents API-backed `agent.run` capability.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Remaining production gates

1. Connect the BFF to the deployed identity/session provider and Civitas OIDC tenant claims.
2. Run the browser-to-BFF-to-Civitas flow against managed Postgres with backups and recovery evidence.
3. Execute the opt-in live OpenAI smoke test with a server-side credential and record the receipt.
4. Add exported OpenTelemetry traces, SLO dashboards, load measurements, and deployment promotion/rollback evidence.
