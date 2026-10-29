import type {
  AgentManifest,
  ApprovalRecord,
  AuditEvent,
  Capability,
  CivitasAdapter,
  ExecutionRequest,
} from './runtime'

type CivitasHttpConfig = {
  baseUrl: string
  token?: string
  fetcher?: typeof fetch
}

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' ? value as JsonObject : {}
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Civitas response missing ${field}`)
  return value
}

function parseApproval(value: unknown): ApprovalRecord {
  const payload = asObject(value)
  return {
    approvalId: requiredString(payload.approvalId, 'approvalId'),
    requestId: requiredString(payload.requestId, 'requestId'),
    tenantId: typeof payload.tenantId === 'string' ? payload.tenantId : undefined,
    principal: requiredString(payload.principal, 'principal'),
    capabilityId: requiredString(payload.capabilityId, 'capabilityId'),
    status: payload.status as ApprovalRecord['status'],
    approvedBy: typeof payload.approvedBy === 'string' ? payload.approvedBy : null,
    expiresAt: typeof payload.expiresAt === 'string' ? payload.expiresAt : undefined,
  }
}

export class CivitasHttpAdapter implements CivitasAdapter {
  private readonly baseUrl: string
  private readonly token?: string
  private readonly fetcher: typeof fetch

  constructor(config: CivitasHttpConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.token = config.token
    this.fetcher = config.fetcher ?? fetch
  }

  async execute(request: ExecutionRequest, agent: AgentManifest, capability: Capability) {
    const payload = await this.post('/v1/execute', {
      protocolVersion: '1.0',
      wait: true,
      request,
      agent: {
        ...agent,
        protocolVersion: '1.0',
      },
      capability,
    })
    return {
      result: payload.result,
      evidence: stringArray(payload.evidence),
      actionsTaken: stringArray(payload.actionsTaken),
    }
  }

  async requestApproval(
    request: ExecutionRequest,
    agent: AgentManifest,
    capability: Capability,
  ): Promise<ApprovalRecord> {
    const payload = await this.post('/v1/approvals', {
      protocolVersion: '1.0',
      request,
      agent: {
        ...agent,
        protocolVersion: '1.0',
      },
      capability,
    })
    return parseApproval(payload.approval)
  }

  async getApproval(approvalId: string): Promise<ApprovalRecord> {
    const payload = await this.get(`/v1/approvals/${encodeURIComponent(approvalId)}`)
    return parseApproval(payload.approval)
  }

  async approveApproval(approvalId: string): Promise<ApprovalRecord> {
    const payload = await this.post(
      `/v1/approvals/${encodeURIComponent(approvalId)}/approve`,
      {},
    )
    return parseApproval(payload.approval)
  }

  async rejectApproval(approvalId: string): Promise<ApprovalRecord> {
    const payload = await this.post(
      `/v1/approvals/${encodeURIComponent(approvalId)}/reject`,
      {},
    )
    return parseApproval(payload.approval)
  }

  async listAgents(): Promise<AgentManifest[]> {
    const payload = await this.get('/v1/agents')
    return Array.isArray(payload.agents) ? payload.agents as AgentManifest[] : []
  }

  async listAuditEvents(): Promise<AuditEvent[]> {
    const payload = await this.get('/v1/audit/events')
    return Array.isArray(payload.events) ? payload.events as AuditEvent[] : []
  }

  async listJobs(): Promise<Array<Record<string, unknown>>> {
    const payload = await this.get('/v1/jobs')
    return Array.isArray(payload.jobs) ? payload.jobs as Array<Record<string, unknown>> : []
  }

  async cancelJob(jobId: string): Promise<Record<string, unknown>> {
    const payload = await this.post(
      `/v1/jobs/${encodeURIComponent(jobId)}/cancel`,
      {},
    )
    return asObject(payload.job)
  }

  private async get(path: string): Promise<JsonObject> {
    return this.request(path, 'GET')
  }

  private async post(path: string, body: JsonObject): Promise<JsonObject> {
    return this.request(path, 'POST', body)
  }

  private async request(path: string, method: 'GET' | 'POST', body?: JsonObject): Promise<JsonObject> {
    const headers: Record<string, string> = {
      accept: 'application/json',
    }
    if (body) headers['content-type'] = 'application/json'
    if (this.token) headers.authorization = `Bearer ${this.token}`

    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    const payload = asObject(await response.json().catch(() => ({})))

    if (!response.ok) {
      const message = typeof payload.error === 'string'
        ? payload.error
        : `Civitas request failed with ${response.status}`
      throw new Error(message)
    }
    return payload
  }
}
