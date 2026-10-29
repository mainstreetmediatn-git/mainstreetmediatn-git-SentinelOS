import { describe, expect, it } from 'vitest'
import {
  HttpAuthGateway,
  HttpAuditPersistence,
  HttpDevicePairingGateway,
  SentinelHttpClient,
} from './remote'

function response(body: unknown, status = 200) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Sentinel HTTP adapters', () => {
  it('hydrates auth and device envelopes with bearer auth', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: input.toString(), init })
      if (input.toString().endsWith('/v1/auth/session')) {
        return response({ session: { sessionId: 'session-1', user: { id: 'owner', name: 'Owner', role: 'owner' }, issuedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z' } })
      }
      return response({ devices: [{ id: 'device-1', label: 'Desk', status: 'paired', capabilities: ['device.status'], pairedAt: '2026-01-01T00:00:00.000Z', lastSeenAt: '2026-01-01T00:00:00.000Z', token: 'device-token' }] })
    }
    const client = new SentinelHttpClient({ endpoint: 'https://sentinel.test', token: () => 'token-1', fetchImpl })

    const session = await new HttpAuthGateway(client).getSession()
    const devices = await new HttpDevicePairingGateway(client).list()

    expect(session?.sessionId).toBe('session-1')
    expect(devices[0]?.id).toBe('device-1')
    expect(calls[0]?.init?.headers).toBeInstanceOf(Headers)
    expect((calls[0]?.init?.headers as Headers).get('authorization')).toBe('Bearer token-1')
  })

  it('keeps the local audit copy while delivering the newest event remotely', async () => {
    const delivered: unknown[] = []
    const fetchImpl: typeof fetch = async (_input, init) => {
      delivered.push(JSON.parse(String(init?.body)))
      return response(undefined, 204)
    }
    const client = new SentinelHttpClient({ endpoint: 'https://sentinel.test', fetchImpl })
    const values = new Map<string, string>()
    const local = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }
    const persistence = new HttpAuditPersistence(client, {
      load: () => [],
      save: (events) => local.setItem('events', JSON.stringify(events)),
    })
    const event = { id: 'event-1', at: '2026-01-01T00:00:00.000Z', actor: 'owner', type: 'auth' as const, message: 'signed in' }

    persistence.save([event])
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(JSON.parse(values.get('events') ?? '[]')).toEqual([event])
    expect(delivered[0]).toEqual({ events: [event] })
  })
})
