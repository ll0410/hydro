export interface OfflineFileEntry {
  path: string
  size: number
  hash: string
}

export interface OfflineManifest {
  app: string
  channel: string
  version: string
  createdAt: number
  files: OfflineFileEntry[]
  totalSize: number
  /** 差量来源版本；全量包为空 */
  from?: string
  /** 发布流程立体签名（HMAC-SHA256） */
  signature: string
}

export interface PackOptions {
  sourceDir: string
  outDir: string
  app: string
  channel: string
  version: string
  signingSecret: string
  /** 差量基线版本（v1 仅记录元信息） */
  from?: string
}

export interface PackResult {
  zipPath: string
  manifest: OfflineManifest
}

export interface DiffReport {
  from: string
  to: string
  added: string[]
  changed: string[]
  removed: string[]
  /** v1 全量下发；bsdiff 差量待接入 */
  mode: 'full' | 'bsdiff'
  note: string
}
