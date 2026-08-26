# Sentinel OS

Sentinel OS is an agent-first command and orchestration layer for coordinating AI agents, automations, memory, devices, and approval policy from one interface.

## Current application

The repository now contains a React + TypeScript + Vite application shell with:

- Command Center
- Agent workforce / Civitas network
- Automations workspace
- Memory workspace
- Device fabric
- Activity / audit stream
- System settings
- Responsive mobile navigation
- Interactive command execution state
- Shared Sentinel visual system and status language

## Architecture direction

Sentinel is the authority and control plane. Civitas is the multi-agent coordination layer. Domain agents and external capabilities execute underneath those layers.

```text
User
  ↓
Sentinel Core
  ↓
Orchestrator / Policy
  ↓
Civitas
  ↓
Agents + Capabilities + Devices
```

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

1. Extract the current UI state into typed Sentinel Core APIs.
2. Implement the agent registry and capability protocol.
3. Add policy/approval gates and execution receipts.
4. Connect Civitas as an orchestration adapter.
5. Replace demo activity with durable event/audit persistence.
6. Add authentication and device pairing.
