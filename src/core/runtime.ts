export const SENTINEL_PROTOCOL_VERSION = '1.0'

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type AgentState =
  | 'ready'
  | 'planning'
  | 'executing'
  | 'waiting'
  | 'blocked'
  | 'needs_approval'
  | 'failed'
  | 'offline'
  | 'paused'
  | 'completed'

export type CapabilityProtocol = {
  version: string
  input: string
  output: string
}

export type Capability = {
  id: string
  description: string
  risk: RiskLevel
  requiresApproval: boolean
  protocol?: CapabilityProtocol
  scopes?: string[]
}

export type AgentManifest = {
  id: string
  name: string
  version: string
  protocolVersion?: string
  role: string
  state: AgentState
  capabilities: string[]
  permissions: string[]
  heartbeatAt?: string
  metadata?: Record<string, string>
}

export type ExecutionRequest = {
  requestId: string
  principal: string
  agentId: string
  capabilityId: string
  input: unknown
  createdAt?: string
  approvalId?: string
  protocolVersion?: string
  deviceId?: string
  constraints?: {
    timeoutMs?: number
    requireApproval?: boolean
  }
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

export type ApprovalRequest = {
  id: string
  requestId: string
  requestedBy: string
  capabilityId: string
  agentId: string
  reason: string
  risk: RiskLevel
  status: ApprovalStatus
  createdAt: string
  expiresAt: string
  approvedBy?: string
  decidedAt?: string
}

export type ExecutionReceipt = {
  receiptId: string
  requestId: string
  agentId: string
  capabilityId: string
  status: 'completed' | 'denied' | 'approval_required' | 'failed'
  startedAt: string
  finishedAt: string
  approvalId?: string
  result?: unknown
  error?: string
  evidence: string[]
  actionsTaken: string[]
  policy: {
    allowed: boolean
    requiresApproval?: boolean
    risk?: RiskLevel
    reason: string
  }
}

export type AuditEventType =
  | 'request'
  | 'policy'
  | 'execution'
  | 'registration'
  | 'approval'
  | 'auth'
  | 'device'

export type AuditEvent = {
  id: string
  at: string
  actor: string
  type: AuditEventType
  message: string
  correlationId?: string
  details?: Record<string, unknown>
}

export type PolicyDecision = {
  allowed: boolean
  requiresApproval: boolean
  risk: RiskLevel
  reason: string
}

export type CivitasExecution = {
  result: unknown
  evidence?: string[]
  actionsTaken?: string[]
}

export interface CivitasAdapter {
  registerAgent?(agent: AgentManifest): Promise<void>
  execute(request: ExecutionRequest, agent: AgentManifest, capability: Capability): Promise<CivitasExecution>
}

export interface AuditPersistence {
  load(): AuditEvent[]
  save(events: AuditEvent[]): void
}

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value)) as T
}

function id(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid ? prefix + '-' + uuid : prefix + '-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function browserStorage(): StorageLike | undefined {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
  } catch {
    return undefined
  }
  return undefined
}

export class LocalStorageAuditPersistence implements AuditPersistence {
  constructor(
    private readonly key = 'sentinel.audit.v1',
    private readonly storage: StorageLike | undefined = browserStorage(),
  ) {}

  load(): AuditEvent[] {
    if (!this.storage) return []
    try {
      const raw = this.storage.getItem(this.key)
      if (!raw) return []
      const events = JSON.parse(raw) as AuditEvent[]
      return Array.isArray(events) ? events : []
    } catch {
      return []
    }
  }

  save(events: AuditEvent[]) {
    try {
      this.storage?.setItem(this.key, JSON.stringify(events))
    } catch {
      // Persistence is best effort; the in-memory stream remains authoritative for this session.
    }
  }
}

export class AgentRegistry {
  private readonly agents = new Map<string, AgentManifest>()

  register(agent: AgentManifest) {
    if (this.agents.has(agent.id)) throw new Error('Agent already registered: ' + agent.id)
    this.agents.set(agent.id, this.normalise(agent))
    return this.get(agent.id)!
  }

  upsert(agent: AgentManifest) {
    this.agents.set(agent.id, this.normalise(agent))
    return this.get(agent.id)!
  }

  unregister(id: string) {
    return this.agents.delete(id)
  }

  get(id: string) {
    const agent = this.agents.get(id)
    return agent ? clone(agent) : undefined
  }

  list() {
    return [...this.agents.values()].map((agent) => clone(agent))
  }

  setState(id: string, state: AgentState) {
    const agent = this.agents.get(id)
    if (!agent) throw new Error('Unknown agent: ' + id)
    agent.state = state
    agent.heartbeatAt = new Date().toISOString()
    return clone(agent)
  }

  heartbeat(id: string, state?: AgentState) {
    const agent = this.agents.get(id)
    if (!agent) throw new Error('Unknown agent: ' + id)
    if (state) agent.state = state
    agent.heartbeatAt = new Date().toISOString()
    return clone(agent)
  }

  private normalise(agent: AgentManifest): AgentManifest {
    return {
      ...clone(agent),
      protocolVersion: agent.protocolVersion ?? SENTINEL_PROTOCOL_VERSION,
      heartbeatAt: agent.heartbeatAt ?? new Date().toISOString(),
      capabilities: [...agent.capabilities],
      permissions: [...agent.permissions],
      metadata: agent.metadata ? { ...agent.metadata } : undefined,
    }
  }
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>()

  register(capability: Capability) {
    if (this.capabilities.has(capability.id)) throw new Error('Capability already registered: ' + capability.id)
    this.capabilities.set(capability.id, this.normalise(capability))
    return this.get(capability.id)!
  }

  upsert(capability: Capability) {
    this.capabilities.set(capability.id, this.normalise(capability))
    return this.get(capability.id)!
  }

  get(id: string) {
    const capability = this.capabilities.get(id)
    return capability ? clone(capability) : undefined
  }

  list() {
    return [...this.capabilities.values()].map((capability) => clone(capability))
  }

  private normalise(capability: Capability): Capability {
    return {
      ...clone(capability),
      protocol: capability.protocol ?? {
        version: SENTINEL_PROTOCOL_VERSION,
        input: 'application/json',
        output: 'application/json',
      },
      scopes: capability.scopes ? [...capability.scopes] : [],
    }
  }
}

export class PolicyEngine {
  evaluate(agent: AgentManifest, capability: Capability, request: ExecutionRequest): PolicyDecision {
    const protocolVersion = request.protocolVersion ?? SENTINEL_PROTOCOL_VERSION
    if ((agent.protocolVersion ?? SENTINEL_PROTOCOL_VERSION) !== protocolVersion) {
      return {
        allowed: false,
        requiresApproval: false,
        risk: capability.risk,
        reason: 'Protocol version mismatch between request and agent.',
      }
    }

    if (!agent.capabilities.includes(capability.id)) {
      return {
        allowed: false,
        requiresApproval: false,
        risk: capability.risk,
        reason: 'Capability not declared by agent.',
      }
    }

    const requiredPermission = 'capability:' + capability.id
    if (!agent.permissions.includes(requiredPermission)) {
      return {
        allowed: false,
        requiresApproval: false,
        risk: capability.risk,
        reason: 'Missing permission: ' + requiredPermission,
      }
    }

    const requiresApproval = Boolean(
      request.constraints?.requireApproval || capability.requiresApproval || capability.risk === 'critical',
    )

    return {
      allowed: true,
      requiresApproval,
      risk: capability.risk,
      reason: requiresApproval
        ? 'Execution is allowed after human approval.'
        : 'Execution allowed by current policy.',
    }
  }
}

export class LocalCivitasAdapter implements CivitasAdapter {
  async registerAgent() {
    return undefined
  }

  async execute(request: ExecutionRequest, agent: AgentManifest, capability: Capability): Promise<CivitasExecution> {
    return {
      result: {
        accepted: true,
        delegatedBy: 'civitas-local',
        agent: agent.id,
        capability: capability.id,
        input: request.input,
      },
      evidence: ['agent:' + agent.id, 'capability:' + capability.id],
      actionsTaken: ['Civitas delegated ' + capability.id + ' to ' + agent.id],
    }
  }
}

export class HttpCivitasAdapter implements CivitasAdapter {
  private readonly baseUrl: string
  private readonly fetchImpl: typeof fetch

  constructor(baseUrl: string, fetchImpl: typeof fetch = globalThis.fetch) {
    if (!fetchImpl) throw new Error('Fetch is required for the HTTP Civitas adapter.')
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.fetchImpl = fetchImpl
  }

  async registerAgent(agent: AgentManifest) {
    await this.post('/v1/agents/register', { protocolVersion: SENTINEL_PROTOCOL_VERSION, agent })
  }

  async execute(request: ExecutionRequest, agent: AgentManifest, capability: Capability): Promise<CivitasExecution> {
    const response = await this.post('/v1/execute', {
      protocolVersion: SENTINEL_PROTOCOL_VERSION,
      request,
      agent,
      capability,
    })

    if (response && typeof response === 'object' && 'result' in response) {
      return response as CivitasExecution
    }

    return { result: response }
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await this.fetchImpl(this.baseUrl + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error('Civitas request failed with HTTP ' + response.status)
    }

    if (response.status === 204) return undefined
    return response.json()
  }
}

export function createCivitasAdapter(endpoint?: string): CivitasAdapter {
  return endpoint && globalThis.fetch ? new HttpCivitasAdapter(endpoint) : new LocalCivitasAdapter()
}

export class AuditStore {
  private events: AuditEvent[]

  constructor(private readonly persistence: AuditPersistence = new LocalStorageAuditPersistence()) {
    this.events = persistence.load().map((event) => clone(event)).slice(0, 250)
  }

  append(event: Omit<AuditEvent, 'id' | 'at'>) {
    const next: AuditEvent = {
      ...clone(event),
      id: id('event'),
      at: new Date().toISOString(),
    }
    this.events = [next, ...this.events].slice(0, 250)
    this.persistence.save(this.events)
    return clone(next)
  }

  list() {
    return this.events.map((event) => clone(event))
  }
}

export type SentinelSnapshot = {
  agents: AgentManifest[]
  capabilities: Capability[]
  approvals: ApprovalRequest[]
  receipts: ExecutionReceipt[]
  events: AuditEvent[]
}

export class SentinelRuntime {
  private readonly approvals = new Map<string, ApprovalRequest>()
  private readonly receipts = new Map<string, ExecutionReceipt>()

  constructor(
    readonly agents = new AgentRegistry(),
    readonly capabilities = new CapabilityRegistry(),
    readonly policy = new PolicyEngine(),
    readonly civitas: CivitasAdapter = new LocalCivitasAdapter(),
    readonly audit = new AuditStore(),
  ) {}

  async registerAgent(agent: AgentManifest) {
    const registered = this.agents.register(agent)
    await this.civitas.registerAgent?.(registered)
    this.audit.append({
      actor: 'sentinel-core',
      type: 'registration',
      message: 'Registered agent ' + agent.id,
      details: { agentId: agent.id, capabilities: agent.capabilities },
    })
    return registered
  }

  createApproval(request: ExecutionRequest, decision: PolicyDecision): ApprovalRequest {
    const existing = [...this.approvals.values()].find(
      (approval) => approval.requestId === request.requestId && approval.status === 'pending',
    )
    if (existing) return clone(existing)

    const createdAt = new Date().toISOString()
    const approval: ApprovalRequest = {
      id: id('approval'),
      requestId: request.requestId,
      requestedBy: request.principal,
      capabilityId: request.capabilityId,
      agentId: request.agentId,
      reason: decision.reason,
      risk: decision.risk,
      status: 'pending',
      createdAt,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }
    this.approvals.set(approval.id, approval)
    this.audit.append({
      actor: 'sentinel-guard',
      type: 'approval',
      correlationId: request.requestId,
      message: 'Approval requested for ' + request.capabilityId,
      details: { approvalId: approval.id, risk: approval.risk },
    })
    return clone(approval)
  }

  approve(approvalId: string, principal: string) {
    const approval = this.approvals.get(approvalId)
    if (!approval) throw new Error('Unknown approval: ' + approvalId)
    if (approval.status !== 'pending') throw new Error('Approval is already ' + approval.status)
    approval.status = 'approved'
    approval.approvedBy = principal
    approval.decidedAt = new Date().toISOString()
    this.audit.append({
      actor: principal,
      type: 'approval',
      correlationId: approval.requestId,
      message: 'Approved execution request',
      details: { approvalId },
    })
    return clone(approval)
  }

  reject(approvalId: string, principal: string) {
    const approval = this.approvals.get(approvalId)
    if (!approval) throw new Error('Unknown approval: ' + approvalId)
    if (approval.status !== 'pending') throw new Error('Approval is already ' + approval.status)
    approval.status = 'rejected'
    approval.approvedBy = principal
    approval.decidedAt = new Date().toISOString()
    this.audit.append({
      actor: principal,
      type: 'approval',
      correlationId: approval.requestId,
      message: 'Rejected execution request',
      details: { approvalId },
    })
    return clone(approval)
  }

  async execute(
    request: ExecutionRequest,
    approval?: { approvalId: string },
  ): Promise<ExecutionReceipt> {
    const startedAt = new Date().toISOString()
    const agent = this.agents.get(request.agentId)
    const capability = this.capabilities.get(request.capabilityId)

    this.audit.append({
      actor: request.principal,
      type: 'request',
      correlationId: request.requestId,
      message: request.agentId + ' requested ' + request.capabilityId,
      details: { deviceId: request.deviceId },
    })

    if (!agent || !capability) {
      const reason = !agent ? 'Unknown agent: ' + request.agentId : 'Unknown capability: ' + request.capabilityId
      return this.finish(request, startedAt, 'failed', false, reason)
    }

    const decision = this.policy.evaluate(agent, capability, request)
    this.audit.append({
      actor: 'sentinel-guard',
      type: 'policy',
      correlationId: request.requestId,
      message: decision.reason,
      details: { allowed: decision.allowed, risk: decision.risk },
    })

    if (!decision.allowed) return this.finish(request, startedAt, 'denied', false, decision.reason, undefined, decision)

    let approvalId: string | undefined
    if (decision.requiresApproval) {
      approvalId = approval?.approvalId ?? request.approvalId
      const approvalRecord = approvalId ? this.approvals.get(approvalId) : undefined

      if (!approvalRecord || approvalRecord.status !== 'approved' || approvalRecord.requestId !== request.requestId) {
        const pending = this.createApproval(request, decision)
        return this.finish(request, startedAt, 'approval_required', true, decision.reason, pending.id, decision)
      }
    }

    try {
      this.agents.setState(agent.id, 'executing')
      const execution = await this.civitas.execute(request, agent, capability)
      this.agents.setState(agent.id, 'ready')
      this.audit.append({
        actor: agent.id,
        type: 'execution',
        correlationId: request.requestId,
        message: 'Completed ' + capability.id,
        details: { receiptId: approvalId },
      })
      return this.finish(
        request,
        startedAt,
        'completed',
        true,
        decision.reason,
        approvalId,
        decision,
        execution.result,
        execution.evidence,
        execution.actionsTaken,
      )
    } catch (error) {
      this.agents.setState(agent.id, 'failed')
      return this.finish(
        request,
        startedAt,
        'failed',
        true,
        error instanceof Error ? error.message : 'Execution failed',
        approvalId,
        decision,
      )
    }
  }

  getApproval(id: string) {
    const approval = this.approvals.get(id)
    return approval ? clone(approval) : undefined
  }

  listApprovals() {
    return [...this.approvals.values()].map((approval) => clone(approval))
  }

  listReceipts() {
    return [...this.receipts.values()].map((receipt) => clone(receipt))
  }

  snapshot(): SentinelSnapshot {
    return {
      agents: this.agents.list(),
      capabilities: this.capabilities.list(),
      approvals: this.listApprovals(),
      receipts: this.listReceipts(),
      events: this.audit.list(),
    }
  }

  private finish(
    request: ExecutionRequest,
    startedAt: string,
    status: ExecutionReceipt['status'],
    allowed: boolean,
    reason: string,
    approvalId?: string,
    decision?: PolicyDecision,
    result?: unknown,
    evidence: string[] = [],
    actionsTaken: string[] = [],
  ): ExecutionReceipt {
    const receipt: ExecutionReceipt = {
      receiptId: id('receipt'),
      requestId: request.requestId,
      agentId: request.agentId,
      capabilityId: request.capabilityId,
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      approvalId,
      result,
      evidence,
      actionsTaken,
      policy: {
        allowed,
        requiresApproval: decision?.requiresApproval,
        risk: decision?.risk,
        reason,
      },
    }
    this.receipts.set(receipt.receiptId, receipt)
    if (status !== 'completed') {
      this.audit.append({
        actor: 'sentinel-core',
        type: status === 'approval_required' ? 'approval' : 'execution',
        correlationId: request.requestId,
        message: 'Execution ' + status + ': ' + reason,
        details: { receiptId: receipt.receiptId, approvalId },
      })
    }
    return clone(receipt)
  }
}

export function createDefaultSentinelRuntime(options: {
  civitas?: CivitasAdapter
  audit?: AuditStore
} = {}) {
  const runtime = new SentinelRuntime(
    new AgentRegistry(),
    new CapabilityRegistry(),
    new PolicyEngine(),
    options.civitas ?? new LocalCivitasAdapter(),
    options.audit ?? new AuditStore(),
  )

  runtime.capabilities.register({
    id: 'task.plan',
    description: 'Plan and decompose a user goal.',
    risk: 'low',
    requiresApproval: false,
    scopes: ['task:read', 'task:plan'],
  })
  runtime.capabilities.register({
    id: 'repo.write',
    description: 'Write approved changes to a repository.',
    risk: 'high',
    requiresApproval: true,
    scopes: ['repo:write'],
  })
  runtime.capabilities.register({
    id: 'memory.read',
    description: 'Retrieve Sentinel project context.',
    risk: 'medium',
    requiresApproval: false,
    scopes: ['memory:read'],
  })
  runtime.capabilities.register({
    id: 'orchestration.dispatch',
    description: 'Delegate work through the Civitas coordination layer.',
    risk: 'medium',
    requiresApproval: false,
    scopes: ['agent:delegate'],
  })

  runtime.agents.register({
    id: 'orchestrator',
    name: 'Orchestrator',
    version: '0.1.0',
    role: 'Plans, delegates, and supervises Sentinel work.',
    state: 'ready',
    capabilities: ['task.plan', 'orchestration.dispatch'],
    permissions: ['capability:task.plan', 'capability:orchestration.dispatch'],
  })
  runtime.agents.register({
    id: 'civitas',
    name: 'Civitas',
    version: '0.1.0',
    role: 'Multi-agent coordination adapter.',
    state: 'ready',
    capabilities: ['orchestration.dispatch'],
    permissions: ['capability:orchestration.dispatch'],
  })
  runtime.agents.register({
    id: 'developer',
    name: 'Developer',
    version: '0.1.0',
    role: 'Implements, tests, and integrates code changes.',
    state: 'ready',
    capabilities: ['repo.write'],
    permissions: ['capability:repo.write'],
  })
  runtime.agents.register({
    id: 'research',
    name: 'Research',
    version: '0.1.0',
    role: 'Finds, extracts, and structures evidence.',
    state: 'ready',
    capabilities: ['memory.read'],
    permissions: ['capability:memory.read'],
  })
  runtime.agents.register({
    id: 'memory',
    name: 'Memory',
    version: '0.1.0',
    role: 'Retrieves project and episodic context.',
    state: 'ready',
    capabilities: ['memory.read'],
    permissions: ['capability:memory.read'],
  })
  runtime.agents.register({
    id: 'policy',
    name: 'Sentinel Guard',
    version: '0.1.0',
    role: 'Evaluates permissions and approval gates.',
    state: 'ready',
    capabilities: ['task.plan'],
    permissions: ['capability:task.plan'],
  })

  return runtime
}
