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
VITE_CIVITAS_URL=http://127.0.0.1:8788 npm run dev
```

For local-only testing, a bearer token may be provided through `VITE_CIVITAS_API_TOKEN`. Do not ship a bearer token in a browser bundle; production deployments should use an authenticated backend session or BFF that keeps credentials server-side.

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

## Next engineering milestones

1. Replace browser-local auth with an OIDC-backed Sentinel session and server-side Civitas gateway.
2. Persist approval requests and decisions with tenant-scoped authorization.
3. Replace Civitas SQLite storage with a Postgres adapter and migrations.
4. Add sandboxed tool execution, streaming sessions, cancellation, and replayable traces.
5. Add usage metering, rate limits, evals, SLOs, and deployment controls.
