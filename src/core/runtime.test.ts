import { describe, expect, it } from 'vitest'
import { createDefaultSentinelRuntime, type ExecutionRequest } from './runtime'

function request(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    requestId: 'req-' + Math.random().toString(36).slice(2),
    principal: 'owner',
    agentId: 'orchestrator',
    capabilityId: 'task.plan',
    input: { goal: 'Ship Sentinel Core' },
    ...overrides,
  }
}

describe('SentinelRuntime', () => {
  it('executes a low-risk declared capability through Civitas', async () => {
    const runtime = createDefaultSentinelRuntime()
    const receipt = await runtime.execute(request())

    expect(receipt.status).toBe('completed')
    expect(receipt.policy.allowed).toBe(true)
    expect(receipt.evidence).toContain('agent:orchestrator')
    expect(runtime.listReceipts()).toHaveLength(1)
  })

  it('creates an approval request and executes only after approval', async () => {
    const runtime = createDefaultSentinelRuntime()
    const writeRequest = request({
      requestId: 'req-write-1',
      agentId: 'developer',
      capabilityId: 'repo.write',
      input: { path: 'src/App.tsx' },
    })

    const blocked = await runtime.execute(writeRequest)
    expect(blocked.status).toBe('approval_required')
    expect(blocked.approvalId).toBeDefined()

    const approval = runtime.listApprovals()[0]
    expect(approval.status).toBe('pending')
    runtime.approve(approval.id, 'owner')

    const approved = await runtime.execute(writeRequest, { approvalId: approval.id })
    expect(approved.status).toBe('completed')
    expect(approved.approvalId).toBe(approval.id)
  })

  it('denies capabilities that are not declared by an agent', async () => {
    const runtime = createDefaultSentinelRuntime()
    const receipt = await runtime.execute(request({ capabilityId: 'memory.read' }))

    expect(receipt.status).toBe('denied')
    expect(receipt.policy.allowed).toBe(false)
  })

  it('tracks agent heartbeat and protocol metadata', () => {
    const runtime = createDefaultSentinelRuntime()
    const agent = runtime.agents.heartbeat('memory', 'waiting')

    expect(agent.state).toBe('waiting')
    expect(agent.protocolVersion).toBe('1.0')
    expect(agent.heartbeatAt).toBeDefined()
  })
})
