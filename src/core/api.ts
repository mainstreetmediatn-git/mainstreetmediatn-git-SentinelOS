import {
  type AgentManifest,
  type AuditEvent,
  AuditStore,
  type Capability,
  type ExecutionReceipt,
  type ExecutionRequest,
  createCivitasAdapter,
  createDefaultSentinelRuntime,
  type SentinelRuntime,
} from './runtime'
import {
  DevicePairingService,
  LocalAuthService,
  type AuthSession,
  type PairingChallenge,
  type PairedDevice,
  type UserIdentity,
} from './auth'
import {
  HttpAuditPersistence,
  HttpAuthGateway,
  HttpDevicePairingGateway,
  SentinelHttpClient,
  type RemoteAuthGateway,
  type RemoteDeviceGateway,
} from './remote'

export type SentinelState = {
  agents: AgentManifest[]
  capabilities: Capability[]
  approvals: ReturnType<SentinelRuntime['listApprovals']>
  receipts: ExecutionReceipt[]
  events: AuditEvent[]
  session: AuthSession | null
  devices: PairedDevice[]
}

export type SentinelRemoteServices = {
  auth?: RemoteAuthGateway
  devices?: RemoteDeviceGateway
}

export type SentinelCoreOptions = {
  runtime?: SentinelRuntime
  auth?: LocalAuthService
  pairing?: DevicePairingService
  civitasEndpoint?: string
  apiEndpoint?: string
  remote?: SentinelRemoteServices
}

export class SentinelCoreApi {
  private readonly listeners = new Set<(state: SentinelState) => void>()

  constructor(
    readonly runtime = createDefaultSentinelRuntime({ civitas: createCivitasAdapter() }),
    readonly auth = new LocalAuthService(),
    readonly pairing = new DevicePairingService(),
    readonly remote?: SentinelRemoteServices,
  ) {
    if (!this.auth.getSession()) this.auth.signIn()
  }

  getState(): SentinelState {
    const snapshot = this.runtime.snapshot()
    return {
      ...snapshot,
      session: this.auth.getSession(),
      devices: this.pairing.list(),
    }
  }

  subscribe(listener: (state: SentinelState) => void) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async hydrateRemote() {
    if (this.remote?.auth) {
      try {
        const session = await this.remote.auth.getSession()
        if (session) this.auth.restore(session)
      } catch {
        // Local authority remains available when the remote identity service is offline.
      }
    }

    if (this.remote?.devices) {
      try {
        this.pairing.replace(await this.remote.devices.list())
      } catch {
        // Local paired devices remain available when the remote device service is offline.
      }
    }

    this.emit()
  }

  async registerAgent(agent: AgentManifest) {
    const session = this.requireSession()
    const registered = await this.runtime.registerAgent(agent)
    this.runtime.audit.append({
      actor: session.user.id,
      type: 'registration',
      message: 'Registered agent ' + registered.id + ' through Sentinel Core',
      details: { agentId: registered.id },
    })
    this.emit()
    return registered
  }

  async execute(request: Omit<ExecutionRequest, 'principal'> & { principal?: string }, approval?: { approvalId: string }) {
    const session = this.requireSession()
    const receipt = await this.runtime.execute(
      {
        ...request,
        principal: request.principal ?? session.user.id,
      },
      approval,
    )
    this.emit()
    return receipt
  }

  approve(approvalId: string) {
    const session = this.requireSession()
    const approval = this.runtime.approve(approvalId, session.user.id)
    this.emit()
    return approval
  }

  reject(approvalId: string) {
    const session = this.requireSession()
    const approval = this.runtime.reject(approvalId, session.user.id)
    this.emit()
    return approval
  }

  async createPairingChallenge(label: string, capabilities?: string[]) {
    const session = this.requireSession()
    const requestedCapabilities = capabilities ?? ['device.execute', 'device.status']
    const challenge = this.remote?.devices
      ? await this.remote.devices.createChallenge(label, requestedCapabilities)
      : this.pairing.createChallenge(label, requestedCapabilities)

    this.runtime.audit.append({
      actor: session.user.id,
      type: 'device',
      message: 'Created a device pairing challenge',
      details: { challengeId: challenge.id, label: challenge.label },
    })
    this.emit()
    return challenge
  }

  async pairDevice(challenge: PairingChallenge, code: string) {
    const session = this.requireSession()
    const device = this.remote?.devices
      ? await this.remote.devices.pair(challenge.id, code)
      : this.pairing.pair(challenge.id, code)

    if (this.remote?.devices) {
      this.pairing.replace([...this.pairing.list().filter((candidate) => candidate.id !== device.id), device])
    }

    this.runtime.audit.append({
      actor: session.user.id,
      type: 'device',
      message: 'Paired device ' + device.label,
      details: { deviceId: device.id, capabilities: device.capabilities },
    })
    this.emit()
    return device
  }

  async revokeDevice(deviceId: string) {
    const session = this.requireSession()
    const device = this.remote?.devices
      ? await this.remote.devices.revoke(deviceId)
      : this.pairing.revoke(deviceId)

    if (this.remote?.devices) {
      this.pairing.replace(this.pairing.list().map((candidate) => candidate.id === device.id ? device : candidate))
    }

    this.runtime.audit.append({
      actor: session.user.id,
      type: 'device',
      message: 'Revoked device ' + device.label,
      details: { deviceId },
    })
    this.emit()
    return device
  }

  async signIn(user: UserIdentity = { id: 'owner', name: 'Local Authority', role: 'owner' }) {
    const session = this.remote?.auth
      ? await this.remote.auth.signIn(user)
      : this.auth.signIn(user)
    this.auth.restore(session)
    this.runtime.audit.append({
      actor: session.user.id,
      type: 'auth',
      message: 'Authenticated with the local authority',
      details: { sessionId: session.sessionId, remote: Boolean(this.remote?.auth) },
    })
    this.emit()
    return session
  }

  async signOut() {
    const session = this.auth.getSession()
    if (session) {
      if (this.remote?.auth) {
        try {
          await this.remote.auth.signOut()
        } catch {
          // Continue clearing the local session if the remote sign-out endpoint is unavailable.
        }
      }
      this.runtime.audit.append({
        actor: session.user.id,
        type: 'auth',
        message: 'Signed out of the local authority',
        details: { sessionId: session.sessionId },
      })
    }
    this.auth.signOut()
    this.emit()
  }

  private requireSession() {
    const session = this.auth.getSession()
    if (!session) throw new Error('Authentication required.')
    return session
  }

  private emit() {
    const next = this.getState()
    this.listeners.forEach((listener) => listener(next))
  }
}

export function createSentinelCore(options: SentinelCoreOptions = {}) {
  const auth = options.auth ?? new LocalAuthService()
  const pairing = options.pairing ?? new DevicePairingService()
  const endpoint = options.apiEndpoint
  let remote = options.remote
  let audit: AuditStore | undefined
  let runtime = options.runtime

  if (endpoint && !remote) {
    const client = new SentinelHttpClient({
      endpoint,
      token: () => auth.getSession()?.sessionId ?? null,
    })
    remote = {
      auth: new HttpAuthGateway(client),
      devices: new HttpDevicePairingGateway(client),
    }
    audit = new AuditStore(new HttpAuditPersistence(client))
  }

  if (!runtime) {
    runtime = createDefaultSentinelRuntime({
      civitas: createCivitasAdapter(options.civitasEndpoint),
      audit,
    })
  }

  return new SentinelCoreApi(runtime, auth, pairing, remote)
}
