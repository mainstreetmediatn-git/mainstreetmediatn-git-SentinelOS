export type AuthRole = 'owner' | 'operator' | 'agent'

export type UserIdentity = {
  id: string
  name: string
  role: AuthRole
}

export type AuthSession = {
  sessionId: string
  user: UserIdentity
  issuedAt: string
  expiresAt: string
}

export type PairedDevice = {
  id: string
  label: string
  status: 'paired' | 'revoked'
  capabilities: string[]
  pairedAt: string
  lastSeenAt: string
  token: string
}

export type PairingChallenge = {
  id: string
  label: string
  code: string
  capabilities: string[]
  createdAt: string
  expiresAt: string
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function id(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ? prefix + '-' + uuid : prefix + '-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function token(prefix: string): string {
  const bytes = new Uint8Array(24)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes)
    return prefix + '-' + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return id(prefix)
}

function pairingCode() {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1)
    globalThis.crypto.getRandomValues(values)
    return (100000 + (values[0] % 900000)).toString()
  }
  return Math.floor(100000 + Math.random() * 900000).toString()
}

function browserStorage(): StorageLike | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    return undefined
  }
  return undefined
}

export class LocalAuthService {
  private session: AuthSession | null

  constructor(
    private readonly storage: StorageLike | undefined = browserStorage(),
    private readonly key = 'sentinel.auth.session.v1',
  ) {
    this.session = this.load()
  }

  signIn(user: UserIdentity = { id: 'owner', name: 'Local Authority', role: 'owner' }) {
    const issuedAt = new Date().toISOString()
    this.session = {
      sessionId: id('session'),
      user,
      issuedAt,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    }
    this.save()
    return this.getSession()!
  }

  restore(session: AuthSession) {
    this.session = {
      ...session,
      user: { ...session.user },
    }
    this.save()
    return this.getSession()!
  }

  signOut() {
    this.session = null
    try {
      this.storage?.removeItem(this.key)
    } catch {
      // Ignore storage failures and keep the in-memory session authoritative.
    }
  }

  getSession() {
    if (this.session && Date.parse(this.session.expiresAt) <= Date.now()) {
      this.signOut()
    }
    return this.session ? { ...this.session, user: { ...this.session.user } } : null
  }

  private load() {
    if (!this.storage) return null
    try {
      const raw = this.storage.getItem(this.key)
      return raw ? (JSON.parse(raw) as AuthSession) : null
    } catch {
      return null
    }
  }

  private save() {
    try {
      if (this.session) this.storage?.setItem(this.key, JSON.stringify(this.session))
    } catch {
      // Local auth still works for the active tab when storage is unavailable.
    }
  }
}

export class DevicePairingService {
  private readonly pending = new Map<string, PairingChallenge>()
  private devices: PairedDevice[]

  constructor(
    private readonly storage: StorageLike | undefined = browserStorage(),
    private readonly key = 'sentinel.devices.v1',
  ) {
    this.devices = this.load()
  }

  createChallenge(label: string, capabilities: string[] = ['device.execute']): PairingChallenge {
    const createdAt = new Date().toISOString()
    const challenge: PairingChallenge = {
      id: id('pair'),
      label: label.trim() || 'Unnamed device',
      code: pairingCode(),
      capabilities: [...capabilities],
      createdAt,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    }
    this.pending.set(challenge.id, challenge)
    return { ...challenge, capabilities: [...challenge.capabilities] }
  }

  pair(challengeId: string, code: string, deviceId = id('device')) {
    const challenge = this.pending.get(challengeId)
    if (!challenge) throw new Error('Unknown pairing challenge.')
    if (Date.parse(challenge.expiresAt) <= Date.now()) {
      this.pending.delete(challengeId)
      throw new Error('Pairing challenge expired.')
    }
    if (challenge.code !== code.trim()) throw new Error('Pairing code is incorrect.')

    const pairedAt = new Date().toISOString()
    const device: PairedDevice = {
      id: deviceId,
      label: challenge.label,
      status: 'paired',
      capabilities: [...challenge.capabilities],
      pairedAt,
      lastSeenAt: pairedAt,
      token: token('device'),
    }
    this.devices = [device, ...this.devices.filter((existing) => existing.id !== device.id)]
    this.pending.delete(challengeId)
    this.save()
    return { ...device, capabilities: [...device.capabilities] }
  }

  revoke(deviceId: string) {
    const device = this.devices.find((candidate) => candidate.id === deviceId)
    if (!device) throw new Error('Unknown device: ' + deviceId)
    device.status = 'revoked'
    device.lastSeenAt = new Date().toISOString()
    this.save()
    return { ...device, capabilities: [...device.capabilities] }
  }

  replace(devices: PairedDevice[]) {
    this.devices = devices.map((device) => ({ ...device, capabilities: [...device.capabilities] }))
    this.save()
    return this.list()
  }

  list() {
    return this.devices.map((device) => ({ ...device, capabilities: [...device.capabilities] }))
  }

  private load() {
    if (!this.storage) return []
    try {
      const raw = this.storage.getItem(this.key)
      const devices = raw ? (JSON.parse(raw) as PairedDevice[]) : []
      return Array.isArray(devices) ? devices : []
    } catch {
      return []
    }
  }

  private save() {
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.devices))
    } catch {
      // The paired device remains usable for the active tab if storage is unavailable.
    }
  }
}
