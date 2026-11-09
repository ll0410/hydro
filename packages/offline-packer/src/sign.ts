import { createHmac, timingSafeEqual } from 'node:crypto'

/** 稳定序列化（对象 key 排序），保证签名端 / 校验端结果一致 */
export function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function createSignature(secret: string, payload: unknown): string {
  return createHmac('sha256', secret).update(canonicalize(payload)).digest('hex')
}

export function verifySignature(secret: string, payload: unknown, signature: string): boolean {
  const expected = createSignature(secret, payload)
  if (expected.length !== signature.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

/** manifest 参与签名的内容：去掉 signature 字段 */
export function manifestForSigning<T>(manifest: T): Omit<T, 'signature'> {
  if (!manifest || typeof manifest !== 'object') return manifest as Omit<T, 'signature'>
  const { signature: _signature, ...rest } = manifest as Record<string, unknown>
  return rest as Omit<T, 'signature'>
}
