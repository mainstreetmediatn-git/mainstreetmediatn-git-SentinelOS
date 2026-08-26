import { describe, expect, it } from 'vitest'
import { createDefaultSentinelRuntime } from './runtime'

describe('SentinelRuntime', () => {
  it('executes a low-risk declared capability', async () => {
    const runtime = createDefaultSentinelRuntime()
    const receipt = await runtime.execute({
      requestId: 'req-plan-1',
      principal: 'owner',
      agentId: 'orchestrator',
      capabilityId: 'task.plan',
      input: { goal: 'Ship Sentinel Core' },
    })

    expect(receipt.status).toBe('completed')
    expect(receipt.policy.allowed).toBe(true)
    expect(receipt.evidence).toContain('agent:orchestrator')
  })

  it('requires approval for high-risk writes', async () => {
    const runtime = createDefaultSentinelRuntime()
    const request = {
      requestId: 'req-write-1',
      principal: 'owner',
      agentId: 'developer',
      capabilityId: 'repo.write',
      input: { path: 'src/App.tsx' },
    }

    const blocked = await runtime.execute(request)
    expect(blocked.status).toBe('approval_required')

    const approved = await runtime.execute(request, true)
    expect(approved.status).toBe('completed')
  })

  it('denies capabilities that are not declared by an agent', async () => {
    const runtime = createDefaultSentinelRuntime()
    const receipt = await runtime.execute({
      requestId: 'req-deny-1',
      principal: 'owner',
      agentId: 'orchestrator',
      capabilityId: 'memory.read',
      input: {},
    })

    expect(receipt.status).toBe('denied')
    expect(receipt.policy.allowed).toBe(false)
  })
})
