import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 8789)
const civitasUrl = process.env.CIVITAS_URL ?? 'http://127.0.0.1:8788'
const civitasToken = process.env.CIVITAS_API_TOKEN
const maxBodyBytes = Number(process.env.SENTINEL_MAX_BODY_BYTES ?? 1_048_576)
const timeoutMs = Number(process.env.SENTINEL_BFF_TIMEOUT_MS ?? 10_000)
const prefix = '/api/civitas'

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  response.end(JSON.stringify(body))
}

async function readBody(request) {
  if (request.headers['transfer-encoding']) throw new Error('chunked request bodies are not supported')
  const length = Number(request.headers['content-length'] ?? 0)
  if (!Number.isFinite(length) || length < 0 || length > maxBodyBytes) throw new Error('request body exceeds the configured size limit')
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > maxBodyBytes) throw new Error('request body exceeds the configured size limit')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://sentinel.local')
  if (!requestUrl.pathname.startsWith(prefix + '/')) return send(response, 404, { error: 'not found' })
  if (!['GET', 'POST'].includes(request.method ?? '')) return send(response, 405, { error: 'method not allowed' })

  const upstreamPath = requestUrl.pathname.slice(prefix.length)
  if (!upstreamPath.startsWith('/v1/')) return send(response, 404, { error: 'not found' })

  try {
    const body = request.method === 'POST' ? await readBody(request) : undefined
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers = { accept: 'application/json' }
      if (body) headers['content-type'] = request.headers['content-type'] ?? 'application/json'
      if (civitasToken) headers.authorization = 'Bearer ' + civitasToken
      const upstream = await fetch(new URL(upstreamPath + requestUrl.search, civitasUrl), {
        method: request.method,
        headers,
        body,
        signal: controller.signal,
      })
      const text = await upstream.text()
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      response.end(text)
    } finally {
      clearTimeout(timer)
    }
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Civitas request timed out' : 'Civitas gateway request failed'
    send(response, 502, { error: message })
  }
})

server.headersTimeout = timeoutMs
server.requestTimeout = timeoutMs
server.listen(port, () => {
  console.log('Sentinel BFF listening on port ' + port)
})
