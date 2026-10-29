import { describe, expect, it } from 'vitest'
import { DevicePairingService, LocalAuthService } from './auth'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('local authority and device pairing', () => {
  it('persists an expiring local session', () => {
    const store = storage()
    const first = new LocalAuthService(store).signIn()
    const second = new LocalAuthService(store).getSession()

    expect(second?.sessionId).toBe(first.sessionId)
    expect(second?.user.role).toBe('owner')
  })

  it('requires the pairing code before issuing a device token', () => {
    const pairing = new DevicePairingService(storage())
    const challenge = pairing.createChallenge('Desk device', ['device.execute'])

    expect(() => pairing.pair(challenge.id, '000000')).toThrow('Pairing code is incorrect.')
    const device = pairing.pair(challenge.id, challenge.code)

    expect(device.label).toBe('Desk device')
    expect(device.status).toBe('paired')
    expect(device.token).toMatch(/^device-/)
  })
})
