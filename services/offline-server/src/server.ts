import { createHmac, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, promises as fs } from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export interface OfflineManifest {
  app: string
  channel: string
  version: string
  createdAt: number
  files: Array<{ path: string; size: number; hash: string }>
  totalSize: number
  from?: string
  signature: string
}

interface StoredPackage {
  manifest: OfflineManifest
  zipPath: string
}

export interface OfflineServerOptions {
  storageDir: string
  secret: string
  port?: number
  host?: string
}

export interface OfflineServerHandle {
  url: string
  port: number
  close(): Promise<void>
}

const NAME_PATTERN = /^[a-zA-Z0-9._-]+$/
const MAX_BODY = 25 * 1024 * 1024

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function signatureOf(secret: string, payload: unknown): string {
  return createHmac('sha256', secret).update(canonicalize(payload)).digest('hex')
}

function verifySignature(secret: string, manifest: OfflineManifest): boolean {
  const { signature, ...rest } = manifest
  const expected = signatureOf(secret, rest)
  if (expected.length !== signature.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = b.split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i] ?? 0
    const r = right[i] ?? 0
    if (l !== r) return l > r ? 1 : -1
  }
  return 0
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_BODY) throw new Error('请求体过大')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function validateName(value: string): boolean {
  return NAME_PATTERN.test(value) && !value.includes('..')
}

async function loadIndex(storageDir: string): Promise<Map<string, StoredPackage>> {
  const index = new Map<string, StoredPackage>()
  if (!existsSync(storageDir)) return index

  const apps = await fs.readdir(storageDir, { withFileTypes: true })
  for (const appEntry of apps) {
    if (!appEntry.isDirectory()) continue
    const appDir = path.join(storageDir, appEntry.name)
    const channels = await fs.readdir(appDir, { withFileTypes: true })
    for (const channelEntry of channels) {
      if (!channelEntry.isDirectory()) continue
      const channelDir = path.join(appDir, channelEntry.name)
      const files = await fs.readdir(channelDir)
      for (const file of files) {
        if (!file.endsWith('.manifest.json')) continue
        const manifest = JSON.parse(
          await fs.readFile(path.join(channelDir, file), 'utf8'),
        ) as OfflineManifest
        const key = `${manifest.app}|${manifest.channel}`
        const current = index.get(key)
        if (!current || compareVersions(manifest.version, current.manifest.version) > 0) {
          index.set(key, {
            manifest,
            zipPath: path.join(channelDir, `${manifest.version}.zip`),
          })
        }
      }
    }
  }
  return index
}

export async function createOfflineServer(
  options: OfflineServerOptions,
): Promise<OfflineServerHandle> {
  const storageDir = path.resolve(options.storageDir)
  const index = await loadIndex(storageDir)

  async function handlePackages(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = (await readJson(req)) as {
      manifest?: OfflineManifest
      package?: string
    }
    const manifest = body.manifest
    if (
      !manifest ||
      !validateName(manifest.app) ||
      !validateName(manifest.channel) ||
      !validateName(manifest.version) ||
      !Array.isArray(manifest.files)
    ) {
      sendJson(res, 400, { ok: false, msg: 'invalid manifest' })
      return
    }
    if (!verifySignature(options.secret, manifest)) {
      sendJson(res, 401, { ok: false, msg: 'invalid signature' })
      return
    }
    if (!body.package) {
      sendJson(res, 400, { ok: false, msg: 'missing package' })
      return
    }

    const channelDir = path.join(storageDir, manifest.app, manifest.channel)
    await fs.mkdir(channelDir, { recursive: true })
    const zipPath = path.join(channelDir, `${manifest.version}.zip`)
    await fs.writeFile(zipPath, Buffer.from(body.package, 'base64'))
    await fs.writeFile(
      path.join(channelDir, `${manifest.version}.manifest.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    )

    const key = `${manifest.app}|${manifest.channel}`
    const current = index.get(key)
    if (!current || compareVersions(manifest.version, current.manifest.version) >= 0) {
      index.set(key, { manifest, zipPath })
    }

    sendJson(res, 200, { ok: true, version: manifest.version })
  }

  function handleLatest(url: URL, res: ServerResponse): void {
    const app = url.searchParams.get('app') ?? ''
    const channel = url.searchParams.get('channel') ?? ''
    if (!validateName(app) || !validateName(channel)) {
      sendJson(res, 400, { ok: false, msg: 'invalid app / channel' })
      return
    }

    const stored = index.get(`${app}|${channel}`)
    if (!stored) {
      sendJson(res, 404, { ok: false, msg: 'package not found' })
      return
    }

    const { manifest } = stored
    sendJson(res, 200, {
      app,
      channel,
      version: manifest.version,
      totalSize: manifest.totalSize,
      downloadUrl: `/download/${app}/${channel}/${manifest.version}`,
      signature: manifest.signature,
      deliverySignature: signatureOf(options.secret, `${app}|${channel}|${manifest.version}`),
      diffAvailable: false,
    })
  }

  function handleDownload(url: URL, pathname: string, res: ServerResponse): void {
    const [, , app, channel, version] = pathname.split('/')
    if (
      !app ||
      !channel ||
      !version ||
      !validateName(app) ||
      !validateName(channel) ||
      !validateName(version)
    ) {
      sendJson(res, 400, { ok: false, msg: 'invalid download path' })
      return
    }

    const stored = index.get(`${app}|${channel}`)
    if (!stored || !existsSync(stored.zipPath)) {
      sendJson(res, 404, { ok: false, msg: 'package not found' })
      return
    }

    const from = url.searchParams.get('from')
    res.writeHead(200, {
      'content-type': 'application/zip',
      'x-hydro-version': version,
      'x-hydro-signature': signatureOf(options.secret, `${app}|${channel}|${version}`),
      // v1 只下发全量包；bsdiff 差量待接入
      'x-hydro-diff': from ? 'full-fallback' : 'full',
    })
    createReadStream(stored.zipPath).pipe(res)
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    void (async () => {
      try {
        if (req.method === 'POST' && url.pathname === '/packages') {
          await handlePackages(req, res)
          return
        }
        if (req.method === 'GET' && url.pathname === '/latest') {
          handleLatest(url, res)
          return
        }
        if (req.method === 'GET' && url.pathname.startsWith('/download/')) {
          handleDownload(url, url.pathname, res)
          return
        }
        if (req.method === 'GET' && url.pathname === '/health') {
          sendJson(res, 200, { ok: true })
          return
        }
        sendJson(res, 404, { ok: false, msg: 'not found' })
      } catch (error) {
        sendJson(res, 500, {
          ok: false,
          msg: error instanceof Error ? error.message : String(error),
        })
      }
    })()
  })

  await new Promise<void>((resolve) => {
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve)
  })

  const address = server.address() as AddressInfo
  const host = options.host ?? '127.0.0.1'

  let closed = false

  return {
    url: `http://${host}:${address.port}`,
    port: address.port,
    async close() {
      if (closed) return
      closed = true
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
  }
}

const isEntry =
  process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntry) {
  const storageDir = process.env.HYDRO_OFFLINE_STORAGE ?? path.resolve('offline-packages')
  const secret = process.env.HYDRO_SIGNING_SECRET ?? 'hydro-dev-secret'
  const port = Number.parseInt(process.env.PORT ?? '8787', 10)
  createOfflineServer({ storageDir, secret, port }).then((handle) => {
    console.log(`[offline-server] listening on ${handle.url}（storage=${storageDir}）`)
  })
}
