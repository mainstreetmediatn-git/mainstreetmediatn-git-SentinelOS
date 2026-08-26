export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type AgentState = 'ready' | 'planning' | 'executing' | 'waiting' | 'blocked' | 'needs_approval' | 'failed' | 'offline' | 'paused' | 'completed'

export type Capability = {
  id: string
  description: string
  risk: RiskLevel
  requiresApproval: boolean
}

export type AgentManifest = {
  id: string
  name: string
  version: string
  role: string
  state: AgentState
  capabilities: string[]
  permissions: string[]
}

export type ExecutionRequest = {
  requestId: string
  principal: string
  agentId: string
  capabilityId: string
  input: unknown
  constraints?: {
    timeoutMs?: number
    requireApproval?: boolean
  }
}

export type ExecutionReceipt = {
  requestId: string
  agentId: string
  capabilityId: string
  status: 'completed' | 'denied' | 'approval_required' | 'failed'
  startedAt: string
  finishedAt: string
  result?: unknown
  evidence: string[]
  actionsTaken: string[]
  policy: {
    allowed: boolean
    reason: string
  }
}

export type AuditEvent = {
  id: string
  at: string
  actor: string
  type: 'request' | 'policy' | 'execution' | 'registration'
  message: string
}

export class AgentRegistry {
  private readonly agents = new Map<string, AgentManifest>()

  register(agent: AgentManifest) {
    if (this.agents.has(agent.id)) throw new Error(`Agent already registered: ${agent.id}`)
    this.agents.set(agent.id, structuredClone(agent))
  }

  get(id: string) {
    const agent = this.agents.get(id)
    return agent ? structuredClone(agent) : undefined
  }

  list() {
    return [...this.agents.values()].map((agent) => structuredClone(agent))
  }

  setState(id: string, state: AgentState) {
    const agent = this.agents.get(id)
    if (!agent) throw new Error(`Unknown agent: ${id}`)
    agent.state = state
  }
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, Capability>()

  register(capability: Capability) {
    if (this.capabilities.has(capability.id)) throw new Error(`Capability already registered: ${capability.id}`)
    this.capabilities.set(capability.id, { ...capability })
  }

  get(id: string) {
    const capability = this.capabilities.get(id)
    return capability ? { ...capability } : undefined
  }

  list() {
    return [...this.capabilities.values()].map((capability) => ({ ...capability }))
  }
}

export class PolicyEngine {
  evaluate(agent: AgentManifest, capability: Capability, request: ExecutionRequest) {
    if (!agent.capabilities.includes(capability.id)) {
      return { allowed: false, requiresApproval: false, reason: 'Capability not declared by agent.' }
    }

    const requiredPermission = `capability:${capability.id}`
    if (!agent.permissions.includes(requiredPermission)) {
      return { allowed: false, requiresApproval: false, reason: `Missing permission: ${requiredPermission}` }
    }

    const requiresApproval = Boolean(request.constraints?.requireApproval || capability.requiresApproval || capability.risk === 'critical')
    return {
      allowed: true,
      requiresApproval,
      reason: requiresApproval ? 'Execution is allowed after human approval.' : 'Execution allowed by current policy.',
    }
  }
}

export interface CivitasAdapter {
  execute(request: ExecutionRequest, agent: AgentManifest, capability: Capability): Promise<{ result: unknown; evidence?: string[]; actionsTaken?: string[] }>
}

export class LocalCivitasAdapter implements CivitasAdapter {
  async execute(request: ExecutionRequest, agent: AgentManifest, capability: Capability) {
    return {
      result: {
        accepted: true,
        delegatedBy: 'civitas',
        agent: agent.id,
        capability: capability.id,
        input: request.input,
      },
      evidence: [`agent:${agent.id}`, `capability:${capability.id}`],
      actionsTaken: [`Civitas delegated ${capability.id} to ${agent.id}`],
    }
  }
}

export class AuditStore {
  private events: AuditEvent[] = []

  append(event: Omit<AuditEvent, 'id' | 'at'>) {
    const next: AuditEvent = {
      ...event,
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
    }
    this.events = [next, ...this.events].slice(0, 250)
    return next
  }

  list() {
    return this.events.map((event) => ({ ...event }))
  }
}

export class SentinelRuntime {
  constructor(
    readonly agents = new AgentRegistry(),
    readonly capabilities = new CapabilityRegistry(),
    readonly policy = new PolicyEngine(),
    readonly civitas: CivitasAdapter = new LocalCivitasAdapter(),
    readonly audit = new AuditStore(),
  ) {}

  async execute(request: ExecutionRequest, approved = false): Promise<ExecutionReceipt> {
    const startedAt = new Date().toISOString()
    const agent = this.agents.get(request.agentId)
    const capability = this.capabilities.get(request.capabilityId)

    this.audit.append({ actor: request.principal, type: 'request', message: `${request.agentId} requested ${request.capabilityId}` })

    if (!agent || !capability) {
      const reason = !agent ? `Unknown agent: ${request.agentId}` : `Unknown capability: ${request.capabilityId}`
      return this.finish(request, startedAt, 'failed', false, reason)
    }

    const decision = this.policy.evaluate(agent, capability, request)
    this.audit.append({ actor: 'sentinel-guard', type: 'policy', message: decision.reason })

    if (!decision.allowed) return this.finish(request, startedAt, 'denied', false, decision.reason)
    if (decision.requiresApproval && !approved) return this.finish(request, startedAt, 'approval_required', true, decision.reason)

    try {
      this.agents.setState(agent.id, 'executing')
      const execution = await this.civitas.execute(request, agent, capability)
      this.agents.setState(agent.id, 'ready')
      this.audit.append({ actor: agent.id, type: 'execution', message: `Completed ${capability.id}` })
      return {
        requestId: request.requestId,
        agentId: request.agentId,
        capabilityId: request.capabilityId,
        status: 'completed',
        startedAt,
        finishedAt: new Date().toISOString(),
        result: execution.result,
        evidence: execution.evidence ?? [],
        actionsTaken: execution.actionsTaken ?? [],
        policy: { allowed: true, reason: decision.reason },
      }
    } catch (error) {
      this.agents.setState(agent.id, 'failed')
      return this.finish(request, startedAt, 'failed', true, error instanceof Error ? error.message : 'Execution failed')
    }
  }

  private finish(request: ExecutionRequest, startedAt: string, status: ExecutionReceipt['status'], allowed: boolean, reason: string): ExecutionReceipt {
    return {
      requestId: request.requestId,
      agentId: request.agentId,
      capabilityId: request.capabilityId,
      status,
      startedAt,
      finishedAt: new Date().toISOString(),
      evidence: [],
      actionsTaken: [],
      policy: { allowed, reason },
    }
  }
}

export function createDefaultSentinelRuntime() {
  const runtime = new SentinelRuntime()

  runtime.capabilities.register({ id: 'task.plan', description: 'Plan and decompose a user goal.', risk: 'low', requiresApproval: false })
  runtime.capabilities.register({ id: 'repo.write', description: 'Write approved changes to a repository.', risk: 'high', requiresApproval: true })
  runtime.capabilities.register({ id: 'memory.read', description: 'Retrieve Sentinel project context.', risk: 'medium', requiresApproval: false })

  runtime.agents.register({
    id: 'orchestrator',
    name: 'Orchestrator',
    version: '0.1.0',
    role: 'Plans, delegates, and supervises Sentinel work.',
    state: 'ready',
    capabilities: ['task.plan'],
    permissions: ['capability:task.plan'],
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
    id: 'memory',
    name: 'Memory',
    version: '0.1.0',
    role: 'Retrieves project and episodic context.',
    state: 'ready',
    capabilities: ['memory.read'],
    permissions: ['capability:memory.read'],
  })

  return runtime
}
