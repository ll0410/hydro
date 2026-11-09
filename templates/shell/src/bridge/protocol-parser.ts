import {
  ErrorCode,
  isBridgeRequest,
  type BridgeRequest,
  type BridgeResponse,
} from '@hydro/shared'

export type ParseResult =
  | { ok: true; request: BridgeRequest }
  | { ok: false; response: BridgeResponse }

function fail(id: string, code: ErrorCode, msg: string): ParseResult {
  return { ok: false, response: { id, code, msg } }
}

/** 解析并校验原生侧收到的原始报文（JSON 字符串或对象） */
export function parseIncoming(raw: unknown): ParseResult {
  let payload: unknown = raw

  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw)
    } catch {
      return fail('unknown', ErrorCode.InvalidParams, 'invalid json payload')
    }
  }

  if (!isBridgeRequest(payload)) {
    const id =
      typeof payload === 'object' && payload !== null && typeof (payload as { id?: unknown }).id === 'string'
        ? (payload as { id: string }).id
        : 'unknown'
    return fail(id, ErrorCode.InvalidParams, 'invalid bridge request')
  }

  return { ok: true, request: payload }
}
