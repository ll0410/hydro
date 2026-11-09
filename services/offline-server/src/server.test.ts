import { createHmac } from 'node:crypto'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createOfflineServer, type OfflineManifest } from './server.js'

const SECRET = 'server-test-secret'
const dirs: string[] = []
const closers: Array<() => Promise<void>> = []

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sign(manifest: Omit<OfflineManifest, 'signature'>): string {
  return createHmac('sha256', SECRET).update(canonicalize(manifest)).digest('hex')
}

function makeManifest(version: string, validSignature = true): OfflineManifest {
  const base = {
    app: 'demo',
    channel: 'prod',
    version,
    createdAt: Date.now(),
    files: [{ path: 'index.html', size: 7, hash: 'h1' }],
    totalSize: 7,
  }
  return {
    ...base,
    signature: validSignature ? sign(base) : 'deadbeef',
  }
}

async function startServer(storageDir: string) {
  const handle = await createOfflineServer({ storageDir, secret: SECRET, port: 0 })
  closers.push(() => handle.close())
  return handle
}

async function publish(baseUrl: string, manifest: OfflineManifest, zipContent: string) {
  return fetch(`${baseUrl}/packages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      manifest,
      package: Buffer.from(zipContent).toString('base64'),
    }),
  })
}

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()))
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('offline-server', () => {
  it('发布 → 查询最新 → 下载全量包', async () => {
    const storageDir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-offline-server-'))
    dirs.push(storageDir)
    const server = await startServer(storageDir)

    const publishResponse = await publish(server.url, makeManifest('1.0.0'), 'ZIP-V1')
    expect(publishResponse.status).toBe(200)

    const latest = await fetch(`${server.url}/latest?app=demo&channel=prod`)
    expect(latest.status).toBe(200)
    const latestBody = (await latest.json()) as {
      version: string
      downloadUrl: string
      deliverySignature: string
    }
    expect(latestBody.version).toBe('1.0.0')
    expect(latestBody.downloadUrl).toBe('/download/demo/prod/1.0.0')
    expect(latestBody.deliverySignature).toHaveLength(64)

    const download = await fetch(`${server.url}${latestBody.downloadUrl}?from=0.9.0`)
    expect(download.status).toBe(200)
    expect(download.headers.get('x-hydro-diff')).toBe('full-fallback')
    expect(download.headers.get('x-hydro-signature')).toHaveLength(64)
    expect(await download.text()).toBe('ZIP-V1')
  })

  it('拒绝签名非法的包', async () => {
    const storageDir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-offline-server-bad-'))
    dirs.push(storageDir)
    const server = await startServer(storageDir)

    const response = await publish(server.url, makeManifest('1.0.0', false), 'ZIP')
    expect(response.status).toBe(401)
  })

  it('重启后索引从磁盘恢复', async () => {
    const storageDir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-offline-server-restart-'))
    dirs.push(storageDir)

    const first = await startServer(storageDir)
    await publish(first.url, makeManifest('1.0.0'), 'ZIP-V1')
    await first.close()

    const second = await startServer(storageDir)
    const latest = await fetch(`${second.url}/latest?app=demo&channel=prod`)
    expect(latest.status).toBe(200)
    expect(((await latest.json()) as { version: string }).version).toBe('1.0.0')
  })

  it('未知版本返回 404', async () => {
    const storageDir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-offline-server-404-'))
    dirs.push(storageDir)
    const server = await startServer(storageDir)

    const response = await fetch(`${server.url}/download/demo/prod/9.9.9`)
    expect(response.status).toBe(404)
  })
})
