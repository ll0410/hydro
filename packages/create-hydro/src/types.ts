export type TemplateName = 'shell' | 'minimal'
export type PackageManager = 'pnpm' | 'npm' | 'yarn'

export interface TemplateVariable {
  key: string
  prompt: string
  default: string
}

export interface TemplateMeta {
  name: string
  version: string
  description?: string
  variables: TemplateVariable[]
  ignore: string[]
}

export interface ManifestFile {
  path: string
  hash: string
}

export interface HydroManifest {
  frameworkVersion: string
  files: ManifestFile[]
}

export interface ScaffoldOptions {
  /** 生成目录（绝对路径） */
  targetDir: string
  projectName: string
  template?: TemplateName
  packageManager?: PackageManager
  /** 是否执行依赖安装，默认 true */
  install?: boolean
  /** 本地开发时把 @hydro/* 指向仓库 packages 目录 */
  localPackagesDir?: string
  /** 模板根目录，默认从仓库 / 包内解析 */
  templatesDir?: string
  frameworkVersion?: string
}

export interface ScaffoldResult {
  projectDir: string
  files: ManifestFile[]
  manifest: HydroManifest
  templateFiles: number
}
