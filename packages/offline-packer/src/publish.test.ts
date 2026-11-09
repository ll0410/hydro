import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { packDirectory } from './pack.js'
import { publishPackage } from './publish.js'

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('publishPackage', () => {
  it('上传 manifest 与 base64 zip', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-publish-'))
    dirs.push(dir)
    await fs.writeFile(path.join(dir, 'index.html'), 'hello')

    const packed = await packDirectory({
      sourceDir: dir,
      outDir: path.join(dir, 'out'),
      app: 'demo',
      channel: 'prod',
      version: '1.0.0',
      signingSecret: 'secret',
    })

    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )
    const result = await publishPackage({
      serverUrl: 'http://127.0.0.1:9000/',
      zipPath: packed.zipPath,
      manifest: packed.manifest,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    expect(result.ok).toBe(true)
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:9000/packages')
    const body = JSON.parse(init?.body as string) as {
      manifest: { version: string }
      package: string
    }
    expect(body.manifest.version).toBe('1.0.0')
    expect(body.package.length).toBeGreaterThan(0)
  })

  it('服务端拒绝时抛错', async () => {
    const dir = await fs.mkdtemp(path.join(tmpdir(), 'hydro-publish-fail-'))
    dirs.push(dir)
    await fs.writeFile(path.join(dir, 'index.html'), 'hello')
    const packed = await packDirectory({
      sourceDir: dir,
      outDir: path.join(dir, 'out'),
      app: 'demo',
      channel: 'prod',
      version: '1.0.0',
      signingSecret: 'secret',
    })

    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('bad signature', { status: 401 }),
    )
    await expect(
      publishPackage({
        serverUrl: 'http://127.0.0.1:9000',
        zipPath: packed.zipPath,
        manifest: packed.manifest,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow('HTTP 401')
  })
})
