import {
  type AgentManifest,
  type AuditEvent,
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

export type SentinelState = {
  agents: AgentManifest[]
  capabilities: Capability[]
  approvals: ReturnType<SentinelRuntime['listApprovals']>
  receipts: ExecutionReceipt[]
  events: AuditEvent[]
  session: AuthSession | null
  devices: PairedDevice[]
}

export type SentinelCoreOptions = {
  runtime?: SentinelRuntime
  auth?: LocalAuthService
  pairing?: DevicePairingService
  civitasEndpoint?: string
}

export class SentinelCoreApi {
  private readonly listeners = new Set<(state: SentinelState) => void>()

  constructor(
    readonly runtime = createDefaultSentinelRuntime({ civitas: createCivitasAdapter() }),
    readonly auth = new LocalAuthService(),
    readonly pairing = new DevicePairingService(),
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

  async execute(request: Omit<ExecutionRequest, 'principal'> & { principal?: string }, approval: boolean | { approvalId: string } = false) {
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

  createPairingChallenge(label: string, capabilities?: string[]) {
    const session = this.requireSession()
    const challenge = this.pairing.createChallenge(label, capabilities)
    this.runtime.audit.append({
      actor: session.user.id,
      type: 'device',
      message: 'Created a device pairing challenge',
      details: { challengeId: challenge.id, label: challenge.label },
    })
    this.emit()
    return challenge
  }

  pairDevice(challenge: PairingChallenge, code: string) {
    const session = this.requireSession()
    const device = this.pairing.pair(challenge.id, code)
    this.runtime.audit.append({
      actor: session.user.id,
      type: 'device',
      message: 'Paired device ' + device.label,
      details: { deviceId: device.id, capabilities: device.capabilities },
    })
    this.emit()
    return device
  }

  revokeDevice(deviceId: string) {
    const session = this.requireSession()
    const device = this.pairing.revoke(deviceId)
    this.runtime.audit.append({
      actor: session.user.id,
      type: 'device',
      message: 'Revoked device ' + device.label,
      details: { deviceId },
    })
    this.emit()
    return device
  }

  signIn(user?: UserIdentity) {
    const session = this.auth.signIn(user)
    this.runtime.audit.append({
      actor: session.user.id,
      type: 'auth',
      message: 'Authenticated with the local authority',
      details: { sessionId: session.sessionId },
    })
    this.emit()
    return session
  }

  signOut() {
    const session = this.auth.getSession()
    if (session) {
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
  const runtime = options.runtime ?? createDefaultSentinelRuntime({
    civitas: createCivitasAdapter(options.civitasEndpoint),
  })
  return new SentinelCoreApi(runtime, options.auth, options.pairing)
}
