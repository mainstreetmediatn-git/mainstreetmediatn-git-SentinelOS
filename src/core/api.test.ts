import { describe, expect, it } from 'vitest'
import { SentinelCoreApi } from './api'
import { DevicePairingService, LocalAuthService } from './auth'
import { createDefaultSentinelRuntime } from './runtime'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

function core() {
  return new SentinelCoreApi(
    createDefaultSentinelRuntime(),
    new LocalAuthService(storage()),
    new DevicePairingService(storage()),
  )
}

describe('SentinelCoreApi', () => {
  it('drives the approval and receipt lifecycle through one state surface', async () => {
    const sentinel = core()
    const initial = sentinel.getState()
    const request = await sentinel.execute({
      requestId: 'api-approval-1',
      agentId: 'developer',
      capabilityId: 'repo.write',
      input: { path: 'src/App.tsx' },
    })

    expect(request.status).toBe('approval_required')
    const approval = sentinel.getState().approvals.find((candidate) => candidate.requestId === request.requestId)
    expect(approval?.status).toBe('pending')

    sentinel.approve(approval!.id)
    const receipt = await sentinel.execute(
      {
        requestId: 'api-approval-1',
        agentId: 'developer',
        capabilityId: 'repo.write',
        input: { path: 'src/App.tsx' },
      },
      { approvalId: approval!.id },
    )

    expect(receipt.status).toBe('completed')
    expect(sentinel.getState().receipts).toHaveLength(2)
    expect(sentinel.getState().events.length).toBeGreaterThan(initial.events.length)
  })

  it('enforces authentication and completes device pairing lifecycle', async () => {
    const sentinel = core()
    await sentinel.signOut()

    await expect(sentinel.execute({
      requestId: 'api-auth-1',
      agentId: 'orchestrator',
      capabilityId: 'task.plan',
      input: { goal: 'should be blocked' },
    })).rejects.toThrow('Authentication required.')

    await sentinel.signIn()
    const challenge = await sentinel.createPairingChallenge('Integration device', ['device.status'])
    const device = await sentinel.pairDevice(challenge, challenge.code)

    expect(sentinel.getState().devices[0]?.id).toBe(device.id)
    await sentinel.revokeDevice(device.id)
    expect(sentinel.getState().devices[0]?.status).toBe('revoked')
  })
})
