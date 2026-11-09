import type { BridgeNamespace, PermissionLevel } from './protocol'

/** 单个桥接方法的元信息 */
export interface ApiMethodSpec {
  /** 权限级 */
  permission: PermissionLevel
  /** 方法说明 */
  description: string
  /** 默认超时毫秒数，缺省由 SDK 使用 15s */
  timeout?: number
}

/** API 注册表结构 */
export type ApiRegistry = Record<BridgeNamespace, Record<string, ApiMethodSpec>>

/**
 * 全量 API 注册表（唯一事实源）。
 *
 * 新增桥接方法必须在此登记：前端 SDK 用它做类型推导，原生侧用它做鉴权与路由校验。
 */
export const API_REGISTRY = {
  ui: {
    toast: { permission: 'public', description: '轻提示' },
    alert: { permission: 'public', description: '对话框' },
    setTitle: { permission: 'public', description: '设置导航标题' },
    navigateTo: { permission: 'public', description: '原生路由跳转' },
  },
  device: {
    scan: { permission: 'protected', description: '扫码', timeout: 60_000 },
    getLocation: { permission: 'protected', description: '获取定位' },
    bluetooth: { permission: 'protected', description: '蓝牙能力' },
    clipboard: { permission: 'protected', description: '读写剪贴板' },
  },
  app: {
    getVersion: { permission: 'protected', description: '读取 App 版本' },
    checkUpdate: { permission: 'protected', description: '检查壳热更新' },
    restart: { permission: 'protected', description: '重启应用' },
  },
  auth: {
    getToken: { permission: 'private', description: '读取登录 token' },
    login: { permission: 'private', description: '调起原生登录' },
    logout: { permission: 'private', description: '退出登录' },
  },
  pay: {
    invoke: { permission: 'private', description: '发起支付', timeout: 120_000 },
    getStatus: { permission: 'private', description: '查询支付结果' },
  },
  media: {
    takePhoto: { permission: 'private', description: '拍照' },
    recordVideo: { permission: 'private', description: '录像' },
    chooseImage: { permission: 'private', description: '选择图片' },
  },
  util: {
    report: { permission: 'public', description: '埋点上报' },
    log: { permission: 'public', description: '日志透传' },
  },
} as const satisfies ApiRegistry

/** 从注册表推导方法名联合类型 */
export type ApiNamespace = keyof typeof API_REGISTRY

/** 取指定命名空间的方法名 */
export type ApiMethods<N extends ApiNamespace> = keyof (typeof API_REGISTRY)[N]

/** 方法元信息查询 */
export function getApiSpec(ns: string, method: string): ApiMethodSpec | undefined {
  const namespace = (API_REGISTRY as ApiRegistry)[ns as ApiNamespace]
  return namespace?.[method]
}
