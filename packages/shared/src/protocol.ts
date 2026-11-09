/**
 * JSBridge 统一消息协议。
 *
 * 所有 H5 ↔ 原生交互都必须使用这里的类型，两端从同一份定义编译，
 * 协议字段一旦漂移会在编译期暴露。
 */

/** 桥接命名空间，与 API 注册表一一对应 */
export type BridgeNamespace = 'ui' | 'device' | 'app' | 'auth' | 'pay' | 'media' | 'util'

/** 方法权限级：public 直接调用、protected 需用户动态授权、private 仅白名单域名 */
export type PermissionLevel = 'public' | 'protected' | 'private'

/** H5 → Native 请求 */
export interface BridgeRequest<P = Record<string, unknown>> {
  /** 请求唯一标识，用于串联请求与回调 */
  id: string
  /** 命名空间 */
  ns: BridgeNamespace
  /** 命名空间内的方法名 */
  method: string
  /** 业务参数 */
  params?: P
  /** 发起时间戳（毫秒） */
  ts: number
}

/** 统一错误码，与架构文档约定一致 */
export enum ErrorCode {
  /** 成功 */
  Success = 0,
  /** 鉴权失败（token 无效 / 未登录） */
  AuthFailed = 401,
  /** 无权限（域名或权限级不允许） */
  Forbidden = 403,
  /** 方法未注册 */
  NotFound = 404,
  /** 参数非法 */
  InvalidParams = 409,
  /** 原生异常 */
  NativeError = 500,
  /** 调用超时 */
  Timeout = 504,
}

/** Native → H5 响应 */
export interface BridgeResponse<T = unknown> {
  /** 对应请求的 id */
  id: string
  /** 错误码 */
  code: ErrorCode
  /** 业务数据，成功时返回 */
  data?: T
  /** 错误或提示信息 */
  msg?: string
}

/** 桥接调用成功判定 */
export function isOk(response: BridgeResponse): boolean {
  return response.code === ErrorCode.Success
}
