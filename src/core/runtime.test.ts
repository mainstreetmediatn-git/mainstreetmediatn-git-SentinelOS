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

  it('rejects duplicate logical commands while the first run is pending', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const runtime = createDefaultSentinelRuntime({
      execute: async () => {
        await pending
        return { result: { ok: true } }
      },
    })

    const request = {
      requestId: 'req-duplicate-1',
      principal: 'owner',
      agentId: 'orchestrator',
      capabilityId: 'task.plan' as const,
      input: { goal: 'same command' },
    }
    const first = runtime.execute(request)
    await expect(runtime.execute({ ...request, requestId: 'req-duplicate-2' })).rejects.toThrow('already in progress')
    release()
    await expect(first).resolves.toMatchObject({ status: 'completed' })
  })
  it('allows identical commands across tenant and principal scopes', async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    let executions = 0
    const runtime = createDefaultSentinelRuntime({
      execute: async () => {
        executions += 1
        await pending
        return { result: { ok: true } }
      },
    })

    const baseRequest = {
      requestId: 'req-scoped-1',
      agentId: 'orchestrator',
      capabilityId: 'task.plan' as const,
      input: { goal: 'same command' },
    }
    const first = runtime.execute({ ...baseRequest, tenantId: 'tenant-a', principal: 'owner' })
    const second = runtime.execute({ ...baseRequest, requestId: 'req-scoped-2', tenantId: 'tenant-b', principal: 'owner' })
    const third = runtime.execute({ ...baseRequest, requestId: 'req-scoped-3', tenantId: 'tenant-a', principal: 'operator' })

    expect(executions).toBe(3)
    release()
    await expect(Promise.all([first, second, third])).resolves.toHaveLength(3)
  })

})
