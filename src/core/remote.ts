import type {
  AuditEvent,
  AuditPersistence,
  StorageLike as RuntimeStorageLike,
} from './runtime'
import { LocalStorageAuditPersistence } from './runtime'
import type {
  AuthSession,
  PairingChallenge,
  PairedDevice,
  UserIdentity,
} from './auth'

export type RemoteClientConfig = {
  endpoint: string
  token?: () => string | null
  fetchImpl?: typeof fetch
}

export class SentinelHttpClient {
  private readonly endpoint: string
  private readonly token?: () => string | null
  private readonly fetchImpl: typeof fetch

  constructor(config: RemoteClientConfig) {
    if (!config.fetchImpl && !globalThis.fetch) throw new Error('Fetch is required for the Sentinel HTTP client.')
    this.endpoint = config.endpoint.replace(/\/$/, '')
    this.token = config.token
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch
  }

  async get<T>(path: string) {
    return this.request<T>(path, { method: 'GET' })
  }

  async post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers)
    const bearer = this.token?.()
    if (bearer) headers.set('authorization', 'Bearer ' + bearer)

    const response = await this.fetchImpl(this.endpoint + path, { ...init, headers })
    if (!response.ok) throw new Error('Sentinel API request failed with HTTP ' + response.status)
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
}

export interface RemoteAuthGateway {
  getSession(): Promise<AuthSession | null>
  signIn(user: UserIdentity): Promise<AuthSession>
  signOut(): Promise<void>
}

export interface RemoteDeviceGateway {
  list(): Promise<PairedDevice[]>
  createChallenge(label: string, capabilities: string[]): Promise<PairingChallenge>
  pair(challengeId: string, code: string): Promise<PairedDevice>
  revoke(deviceId: string): Promise<PairedDevice>
}

export class HttpAuthGateway implements RemoteAuthGateway {
  constructor(private readonly client: SentinelHttpClient) {}

  async getSession() {
    const response = await this.client.get<{ session?: AuthSession } | AuthSession>('/v1/auth/session')
    return isSessionEnvelope(response) ? response.session ?? null : response
  }

  async signIn(user: UserIdentity) {
    const response = await this.client.post<{ session?: AuthSession } | AuthSession>('/v1/auth/session', { user })
    const session = isSessionEnvelope(response) ? response.session : response
    if (!session) throw new Error('Sentinel API did not return an authenticated session.')
    return session
  }

  async signOut() {
    await this.client.post('/v1/auth/sign-out')
  }
}

export class HttpDevicePairingGateway implements RemoteDeviceGateway {
  constructor(private readonly client: SentinelHttpClient) {}

  async list() {
    const response = await this.client.get<{ devices?: PairedDevice[] } | PairedDevice[]>('/v1/devices')
    return Array.isArray(response) ? response : response.devices ?? []
  }

  async createChallenge(label: string, capabilities: string[]) {
    const response = await this.client.post<{ challenge?: PairingChallenge } | PairingChallenge>(
      '/v1/devices/pair/challenge',
      { label, capabilities },
    )
    return isChallengeEnvelope(response) ? response.challenge : response
  }

  async pair(challengeId: string, code: string) {
    const response = await this.client.post<{ device?: PairedDevice } | PairedDevice>(
      '/v1/devices/pair',
      { challengeId, code },
    )
    return isDeviceEnvelope(response) ? response.device : response
  }

  async revoke(deviceId: string) {
    const response = await this.client.post<{ device?: PairedDevice } | PairedDevice>(
      '/v1/devices/' + encodeURIComponent(deviceId) + '/revoke',
    )
    return isDeviceEnvelope(response) ? response.device : response
  }
}

export class HttpAuditPersistence implements AuditPersistence {
  private lastError: string | undefined

  constructor(
    private readonly client: SentinelHttpClient,
    private readonly local: AuditPersistence = new LocalStorageAuditPersistence(),
  ) {}

  load() {
    return this.local.load()
  }

  save(events: AuditEvent[]) {
    this.local.save(events)
    const newest = events[0]
    if (!newest) return
    void this.client.post('/v1/audit/events', { events: [newest] }).catch((error) => {
      this.lastError = error instanceof Error ? error.message : 'Remote audit delivery failed.'
    })
  }

  getLastError() {
    return this.lastError
  }
}

function isSessionEnvelope(value: unknown): value is { session?: AuthSession } {
  return Boolean(value && typeof value === 'object' && 'session' in value)
}

function isChallengeEnvelope(value: unknown): value is { challenge: PairingChallenge } {
  return Boolean(value && typeof value === 'object' && 'challenge' in value)
}

function isDeviceEnvelope(value: unknown): value is { device: PairedDevice } {
  return Boolean(value && typeof value === 'object' && 'device' in value)
}
