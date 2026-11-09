import { promises as fs } from 'node:fs'
import type { OfflineManifest } from './types.js'

export interface PublishOptions {
  serverUrl: string
  zipPath: string
  manifest: OfflineManifest
  fetchImpl?: typeof fetch
}

export interface PublishResult {
  ok: boolean
  status: number
  body: unknown
}

/** 发布离线包：zip 以 base64 上传，服务端验签后入库 */
export async function publishPackage(options: PublishOptions): Promise<PublishResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const packageBase64 = (await fs.readFile(options.zipPath)).toString('base64')
  const response = await fetchImpl(`${options.serverUrl.replace(/\/$/, '')}/packages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ manifest: options.manifest, package: packageBase64 }),
  })

  const text = await response.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }

  if (!response.ok) {
    throw new Error(`发布失败（HTTP ${response.status}）：${text}`)
  }

  return { ok: true, status: response.status, body }
}
