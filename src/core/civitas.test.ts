import { describe, expect, it } from 'vitest'
import { CivitasHttpAdapter } from './civitas'

describe('CivitasHttpAdapter', () => {
  it('sends a versioned envelope and returns the execution receipt payload', async () => {
    let requestBody: Record<string, unknown> | undefined
    const adapter = new CivitasHttpAdapter({
      baseUrl: 'http://civitas.local/',
      token: 'dev-token',
      fetcher: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return {
          ok: true,
          status: 200,
          json: async () => ({
            result: { status: 'planned', worker: 'civitas.task_plan' },
            evidence: ['planner:goal-validated'],
            actionsTaken: ['generated task plan'],
          }),
        } as Response
      },
    })

    const result = await adapter.execute(
      {
        requestId: 'req-1',
        principal: 'owner',
        agentId: 'orchestrator',
        capabilityId: 'task.plan',
        input: { goal: 'Ship Sentinel' },
      },
      {
        id: 'orchestrator',
        name: 'Orchestrator',
        version: '0.1.0',
        role: 'Plans work',
        state: 'ready',
        capabilities: ['task.plan'],
        permissions: ['capability:task.plan'],
      },
      {
        id: 'task.plan',
        description: 'Plan a task',
        risk: 'low',
        requiresApproval: false,
      },
    )

    expect(result.result).toEqual({ status: 'planned', worker: 'civitas.task_plan' })
    expect(result.evidence).toContain('planner:goal-validated')
    expect(requestBody?.protocolVersion).toBe('1.0')
    expect(requestBody?.wait).toBe(true)
    expect((requestBody?.request as Record<string, unknown>).capabilityId).toBe('task.plan')
  })

  it('surfaces Civitas errors without masking the response', async () => {
    const adapter = new CivitasHttpAdapter({
      baseUrl: 'http://civitas.local',
      fetcher: async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: 'approval required' }),
      }) as Response,
    })

    await expect(adapter.execute(
      {
        requestId: 'req-2',
        principal: 'owner',
        agentId: 'developer',
        capabilityId: 'repo.write',
        input: { path: 'README.md' },
      },
      {
        id: 'developer',
        name: 'Developer',
        version: '0.1.0',
        role: 'Writes code',
        state: 'ready',
        capabilities: ['repo.write'],
        permissions: ['capability:repo.write'],
      },
      {
        id: 'repo.write',
        description: 'Write a repository',
        risk: 'high',
        requiresApproval: true,
      },
    )).rejects.toThrow('approval required')
  })
  it('supports durable approval lifecycle calls', async () => {
    const calls: string[] = []
    const adapter = new CivitasHttpAdapter({
      baseUrl: 'http://civitas.local',
      fetcher: async (input, init) => {
        calls.push(`${init?.method} ${String(input)}`)
        const path = String(input)
        const approval = {
          approvalId: 'approval-1',
          requestId: 'req-1',
          principal: 'owner',
          capabilityId: 'repo.write',
          status: path.endsWith('/approve') ? 'approved' : 'pending',
        }
        return {
          ok: true,
          status: 200,
          json: async () => path === '/v1/approvals' || path.endsWith('/approve')
            ? { approval }
            : { approval },
        } as Response
      },
    })

    const request = {
      requestId: 'req-1',
      principal: 'owner',
      agentId: 'developer',
      capabilityId: 'repo.write',
      input: { path: 'README.md' },
    }
    const agent = {
      id: 'developer',
      name: 'Developer',
      version: '0.1.0',
      role: 'Writes code',
      state: 'ready' as const,
      capabilities: ['repo.write'],
      permissions: ['capability:repo.write'],
    }
    const capability = {
      id: 'repo.write',
      description: 'Write a repository',
      risk: 'high' as const,
      requiresApproval: true,
    }

    await expect(adapter.requestApproval?.(request, agent, capability)).resolves.toMatchObject({ status: 'pending' })
    await expect(adapter.getApproval?.('approval-1')).resolves.toMatchObject({ approvalId: 'approval-1' })
    await expect(adapter.approveApproval?.('approval-1')).resolves.toMatchObject({ status: 'approved' })
    expect(calls).toEqual([
      'POST http://civitas.local/v1/approvals',
      'GET http://civitas.local/v1/approvals/approval-1',
      'POST http://civitas.local/v1/approvals/approval-1/approve',
    ])
  })
})
