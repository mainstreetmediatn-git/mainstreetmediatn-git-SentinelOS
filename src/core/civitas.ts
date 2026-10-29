import type { AgentManifest, Capability, CivitasAdapter, ExecutionRequest } from './runtime'

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
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
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
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    }
    if (this.token) headers.authorization = `Bearer ${this.token}`

    const response = await this.fetcher(`${this.baseUrl}/v1/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        protocolVersion: '1.0',
        wait: true,
        request,
        agent: {
          ...agent,
          protocolVersion: '1.0',
        },
        capability,
      }),
    })
    const payload = asObject(await response.json().catch(() => ({})))

    if (!response.ok) {
      const message = typeof payload.error === 'string' ? payload.error : `Civitas request failed with ${response.status}`
      throw new Error(message)
    }

    if (!('result' in payload)) throw new Error('Civitas returned no execution result')

    return {
      result: payload.result,
      evidence: stringArray(payload.evidence),
      actionsTaken: stringArray(payload.actionsTaken),
    }
  }
}
